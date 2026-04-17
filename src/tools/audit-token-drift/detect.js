/**
 * @module audit-token-drift/detect
 *
 * Pure detection logic for Figma-to-Figma variable drift. Given two extracted
 * variable datasets (from the REST API's `GET /files/:key/local_variables`
 * endpoint, or from the `getLocalVariablesScript` MCP extractor), computes:
 *
 * 1. Per-variable resolved values (walking alias chains to a leaf color /
 *    number / string / boolean).
 * 2. A per-collection canonical string that captures every variable × mode
 *    in a deterministic order.
 * 3. A short content hash over that canonical string, so callers can commit
 *    a baseline file and fail CI on any hash change.
 * 4. A structured diff between two datasets, matching collections by an
 *    explicit name map (e.g. `Theme` ↔ `v4 Theme`), and within each
 *    matched pair, flagging specific variable × mode drifts.
 */

/**
 * @typedef {Object} VariableValue
 *   Raw value from the Figma API. One of:
 *   - `{ r, g, b, a }`           for COLOR
 *   - number                      for FLOAT
 *   - string                      for STRING
 *   - boolean                     for BOOLEAN
 *   - `{ type: 'VARIABLE_ALIAS', id }` for aliases to another variable
 */

/**
 * @typedef {Object} VariableEntry
 * @property {string} id
 * @property {string} name
 * @property {string} [key]
 * @property {string} variableCollectionId
 * @property {'COLOR'|'FLOAT'|'STRING'|'BOOLEAN'} resolvedType
 * @property {Object<string, VariableValue>} valuesByMode - Keyed by modeId
 */

/**
 * @typedef {Object} CollectionMode
 * @property {string} modeId
 * @property {string} name
 */

/**
 * @typedef {Object} CollectionEntry
 * @property {string} id
 * @property {string} name
 * @property {CollectionMode[]} modes
 * @property {string[]} variableIds
 */

/**
 * @typedef {Object} VariableDataset
 *   Shape matches both the REST API and `getLocalVariablesScript` MCP output.
 * @property {Object} meta
 * @property {Object<string, CollectionEntry>} meta.variableCollections
 * @property {Object<string, VariableEntry>} meta.variables
 */

/**
 * @typedef {Object} CollectionSnapshot
 * @property {string} collectionName
 * @property {number} variableCount
 * @property {string[]} modeNames
 * @property {string} contentHash
 * @property {Object<string, { type: string, modes: Object<string, string> }>} variables
 *   Variables keyed by NAME (not id), so two datasets can be compared even
 *   though their underlying Figma ids differ.
 */

/**
 * @typedef {Object} VariableDrift
 * @property {string} name - Variable name
 * @property {string} [mode] - Mode name (absent for structural drifts)
 * @property {string} [expected] - Serialized resolved value from the source
 * @property {string} [actual] - Serialized resolved value from the target
 * @property {'value'|'missing-in-target'|'extra-in-target'|'type-mismatch'} kind
 */

/**
 * @typedef {Object} CollectionDiff
 * @property {string} collection - The target-side collection name
 * @property {'match'|'drift'|'missing-source'|'missing-target'} status
 * @property {string} [sourceHash]
 * @property {string} [targetHash]
 * @property {number} [variableCount]
 * @property {number} [driftCount]
 * @property {VariableDrift[]} [drifts]
 */

/**
 * Serializes a color value to a canonical string. Rounds components to six
 * decimal places so floating-point noise doesn't cause false positives.
 *
 * @param {{ r: number, g: number, b: number, a?: number }} c
 * @returns {string}
 */
export function serializeColor(c) {
  const r = Math.round(c.r * 1e6) / 1e6
  const g = Math.round(c.g * 1e6) / 1e6
  const b = Math.round(c.b * 1e6) / 1e6
  const a = c.a !== undefined ? Math.round(c.a * 1e6) / 1e6 : 1
  return `${r},${g},${b},${a}`
}

/**
 * Serializes a raw (non-alias, non-color) value.
 *
 * @param {VariableValue} val
 * @returns {string}
 */
function serializePrimitive(val) {
  if (val === null || val === undefined) return 'N:'
  if (typeof val === 'number') return `F:${val}`
  if (typeof val === 'boolean') return `B:${val}`
  if (typeof val === 'string') return `S:${JSON.stringify(val)}`
  // Unknown shape — fall back to JSON so it's at least deterministic
  return `U:${JSON.stringify(val)}`
}

/**
 * Resolves a variable's value at a given mode, walking alias chains until
 * a leaf is reached. Returns a canonical string tagged with its type.
 *
 * Alias chain rules (mirrors Figma's runtime resolver):
 * - When an alias points into the same collection, the target's value in
 *   the SAME mode id is used.
 * - When it crosses collections, the target's default mode is used
 *   (Figma's UI behavior when inheriting across collections).
 *
 * Returns error sentinels rather than throwing so one bad variable doesn't
 * break a whole collection's hash.
 *
 * @param {VariableEntry} variable
 * @param {string} modeId
 * @param {VariableDataset} dataset
 * @param {number} [depth=0]
 * @returns {string}
 */
export function resolveValue(variable, modeId, dataset, depth = 0) {
  if (depth > 15) return 'ERR:cycle'
  const val = variable.valuesByMode[modeId]
  if (val === undefined) return 'ERR:no_value'

  if (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') {
    const target = dataset.meta.variables[val.id]
    if (!target) return 'ERR:missing_target'
    const targetCollection = dataset.meta.variableCollections[target.variableCollectionId]
    if (!targetCollection) return 'ERR:missing_target_collection'
    const targetModeId = target.variableCollectionId === variable.variableCollectionId
      ? modeId
      : targetCollection.modes[0].modeId
    return resolveValue(target, targetModeId, dataset, depth + 1)
  }

  if (val && typeof val === 'object' && 'r' in val) {
    return 'C:' + serializeColor(val)
  }
  return 'V:' + serializePrimitive(val)
}

/**
 * Deterministic non-cryptographic 32-bit hash, serialized as hex. Stable
 * across runs — suitable for committing as a baseline.
 *
 * @param {string} str
 * @returns {string}
 */
export function contentHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0 // Force 32-bit signed integer
  }
  return h.toString(16)
}

/**
 * Builds a per-collection snapshot of every variable × mode in a dataset.
 * Variables are keyed by NAME so snapshots from two files (with different
 * underlying ids) can be compared.
 *
 * @param {VariableDataset} dataset
 * @returns {Object<string, CollectionSnapshot>} Keyed by collection NAME
 */
export function buildSnapshot(dataset) {
  /** @type {Object<string, CollectionSnapshot>} */
  const out = {}
  const { variableCollections, variables } = dataset.meta

  for (const collection of Object.values(variableCollections)) {
    const collVars = Object.values(variables).filter(
      (v) => v.variableCollectionId === collection.id
    )
    /** @type {Object<string, { type: string, modes: Object<string, string> }>} */
    const byName = {}
    for (const v of collVars) {
      /** @type {Object<string, string>} */
      const modes = {}
      for (const mode of collection.modes) {
        modes[mode.name] = resolveValue(v, mode.modeId, dataset)
      }
      byName[v.name] = { type: v.resolvedType, modes }
    }

    const sortedNames = Object.keys(byName).sort()
    const canonical = sortedNames
      .map((n) => {
        const e = byName[n]
        const modeStr = Object.entries(e.modes)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([m, v]) => `${m}=${v}`)
          .join('|')
        return `${n}[${e.type}]:${modeStr}`
      })
      .join('\n')

    out[collection.name] = {
      collectionName: collection.name,
      variableCount: sortedNames.length,
      modeNames: collection.modes.map((m) => m.name).sort(),
      contentHash: contentHash(canonical),
      variables: byName,
    }
  }

  return out
}

/**
 * Diffs two snapshots against an explicit collection name map. For each
 * mapped pair, compares content hashes and — when they differ — enumerates
 * each variable × mode drift.
 *
 * @param {Object<string, CollectionSnapshot>} source
 * @param {Object<string, CollectionSnapshot>} target
 * @param {Object<string, string>} collectionMap - { sourceCollName: targetCollName }
 * @returns {CollectionDiff[]}
 */
export function diffSnapshots(source, target, collectionMap) {
  /** @type {CollectionDiff[]} */
  const report = []

  for (const [sourceName, targetName] of Object.entries(collectionMap)) {
    const s = source[sourceName]
    const t = target[targetName]

    if (!s && !t) {
      report.push({ collection: targetName, status: 'missing-source' })
      continue
    }
    if (!s) {
      report.push({ collection: targetName, status: 'missing-source' })
      continue
    }
    if (!t) {
      report.push({ collection: targetName, status: 'missing-target' })
      continue
    }
    if (s.contentHash === t.contentHash) {
      report.push({
        collection: targetName,
        status: 'match',
        sourceHash: s.contentHash,
        targetHash: t.contentHash,
        variableCount: s.variableCount,
      })
      continue
    }

    /** @type {VariableDrift[]} */
    const drifts = []

    // Walk source variables; compare each to target
    for (const [name, sEntry] of Object.entries(s.variables)) {
      const tEntry = t.variables[name]
      if (!tEntry) {
        drifts.push({ name, kind: 'missing-in-target' })
        continue
      }
      if (sEntry.type !== tEntry.type) {
        drifts.push({ name, kind: 'type-mismatch', expected: sEntry.type, actual: tEntry.type })
        continue
      }
      for (const [mode, sVal] of Object.entries(sEntry.modes)) {
        const tVal = tEntry.modes[mode]
        if (sVal !== tVal) {
          drifts.push({ name, mode, expected: sVal, actual: tVal, kind: 'value' })
        }
      }
    }

    // Walk target variables to catch ones the source doesn't have
    for (const name of Object.keys(t.variables)) {
      if (!s.variables[name]) drifts.push({ name, kind: 'extra-in-target' })
    }

    report.push({
      collection: targetName,
      status: 'drift',
      sourceHash: s.contentHash,
      targetHash: t.contentHash,
      variableCount: s.variableCount,
      driftCount: drifts.length,
      drifts,
    })
  }

  return report
}
