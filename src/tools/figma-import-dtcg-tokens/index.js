import { flattenDtcg, validateTokens, buildOperationPlan, pathToFigmaName } from './detect.js'
import { getImportScript } from './script.js'

/**
 * @typedef {object} ModeBinding
 * @property {string} name  Figma mode name (e.g. 'default', 'light', 'dark')
 * @property {string} [file]  Path to a DTCG file (resolved via the loader)
 * @property {object} [dtcg]  Inline DTCG bundle, used when no file is given
 */

/**
 * @typedef {object} CollectionConfig
 * @property {string} name        Figma collection name (post-import)
 * @property {string} tokenPrefix Dotted path prefix; only tokens under this prefix go in this collection
 * @property {ModeBinding[]} modes Each mode points to a DTCG source for that mode
 */

/**
 * @typedef {object} ImportConfig
 * @property {CollectionConfig[]} collections
 */

/**
 * @typedef {object} OperationPlan
 * @property {object[]} operations
 * @property {object[]} skipped
 * @property {object[]} errors
 */

/**
 * Loads + validates + plans an import without executing it.
 *
 * Accepts either pre-loaded DTCG bundles (programmatic / tests) via
 * `mode.dtcg`, or file paths via `mode.file` resolved through `readJson`.
 *
 * @param {object} args
 * @param {ImportConfig} args.config
 * @param {(filePath: string) => Promise<object>} [args.readJson]
 *   Loader for file-based modes. Optional if every mode supplies inline DTCG.
 * @param {Map<string, { id: string, type: string, collectionId: string }>} [args.existingVarsByName]
 *   Current Figma state. When omitted, the planner assumes nothing exists yet.
 * @returns {Promise<{ plan: OperationPlan, declaredVarNames: string[] }>}
 */
export async function planImport({ config, readJson, existingVarsByName = new Map() }) {
  // Cache DTCG bundles so a single file shared across collections is read once.
  const fileCache = new Map()

  const taggedTokens = {}
  const validationIssues = []

  for (const collection of config.collections) {
    for (const mode of collection.modes) {
      let dtcg = mode.dtcg
      if (!dtcg) {
        if (!mode.file) {
          throw new Error(
            `Mode "${mode.name}" in collection "${collection.name}" has neither dtcg nor file`,
          )
        }
        if (!readJson) {
          throw new Error(
            `Mode "${mode.name}" requires file loading, but no readJson loader was provided`,
          )
        }
        if (!fileCache.has(mode.file)) {
          fileCache.set(mode.file, await readJson(mode.file))
        }
        dtcg = fileCache.get(mode.file)
      }

      const flat = flattenDtcg(dtcg)
      const issues = validateTokens(flat)
      validationIssues.push(
        ...issues.map((i) => ({ ...i, file: mode.file, mode: mode.name })),
      )

      for (const [path, token] of Object.entries(flat)) {
        if (!path.startsWith(collection.tokenPrefix + '.') && path !== collection.tokenPrefix) continue
        const key = `${collection.name}::${mode.name}::${path}`
        taggedTokens[key] = {
          ...token,
          collectionName: collection.name,
          modeName: mode.name,
        }
      }
    }
  }

  const fatalIssues = validationIssues.filter((i) => i.kind === 'fatal')
  if (fatalIssues.length > 0) {
    return {
      plan: {
        operations: [],
        skipped: [],
        errors: fatalIssues.map((i) => ({ path: i.path, code: i.code, message: i.message })),
      },
      declaredVarNames: [],
    }
  }

  const plan = buildOperationPlan({ tokens: taggedTokens, existingVarsByName })

  const declaredVarNames = [
    ...new Set(Object.values(taggedTokens).map((t) => pathToFigmaName(t.path))),
  ]

  return { plan, declaredVarNames }
}

/**
 * Convenience: produce the Plugin API script for a planned import.
 * Returned string is meant to be run via `use_figma` with `__plan` set to
 * the plan object.
 *
 * @param {object} args
 * @param {string[]} args.declaredVarNames
 * @param {boolean} [args.dryRun]
 * @param {boolean} [args.prune]
 * @returns {string}
 */
export function buildPluginScript({ declaredVarNames, dryRun = false, prune = false }) {
  return getImportScript({ dryRun, prune, declaredVarNames })
}

/**
 * Format a plan summary as human-readable text for the CLI.
 * @param {OperationPlan} plan
 * @returns {string}
 */
export function formatPlanSummary(plan) {
  const lines = []
  const opCounts = plan.operations.reduce((acc, op) => {
    acc[op.kind] = (acc[op.kind] ?? 0) + 1
    return acc
  }, {})

  lines.push('Plan summary:')
  lines.push(`  create-variable: ${opCounts['create-variable'] ?? 0}`)
  lines.push(`  set-value:       ${opCounts['set-value'] ?? 0}`)
  lines.push(`  set-alias:       ${opCounts['set-alias'] ?? 0}`)
  lines.push(`  skipped:         ${plan.skipped.length}`)
  lines.push(`  errors:          ${plan.errors.length}`)

  if (plan.skipped.length > 0) {
    lines.push('')
    lines.push('Skipped:')
    for (const s of plan.skipped) {
      lines.push(`  [${s.code}] ${s.path ?? '(no path)'}: ${s.message}`)
    }
  }
  if (plan.errors.length > 0) {
    lines.push('')
    lines.push('Errors:')
    for (const e of plan.errors) {
      lines.push(`  [${e.code}] ${e.path ?? '(no path)'}: ${e.message}`)
    }
  }
  return lines.join('\n')
}
