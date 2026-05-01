/**
 * Pure detection functions for the DTCG → Figma variables importer.
 *
 * No I/O, no Figma API calls, no side effects. Every function is unit-
 * testable from JS objects alone. The orchestrator (index.js) calls these
 * and hands the result to the Plugin API script for execution.
 */

import {
  collectAliasEdges,
  isAlias,
  parseAlias,
  topologicalSort,
} from '../../shared/alias-resolver.js'

// ---------- DTCG parsing ----------

/**
 * Flattens a nested DTCG object into a flat map of `dotted.path` → token.
 * Inherits `$type` from ancestor groups when a token doesn't declare its own.
 * Skips anything that isn't a leaf (no `$value`).
 *
 * @param {object} dtcg
 * @param {string} [pathPrefix]
 * @param {string | undefined} [inheritedType]
 * @returns {Record<string, { $type: string, $value: unknown, $description?: string, path: string }>}
 */
export function flattenDtcg(dtcg, pathPrefix = '', inheritedType = undefined) {
  const out = {}
  if (!dtcg || typeof dtcg !== 'object') return out

  const groupType = typeof dtcg.$type === 'string' ? dtcg.$type : inheritedType

  for (const [key, value] of Object.entries(dtcg)) {
    if (key.startsWith('$')) continue
    if (!value || typeof value !== 'object') continue

    const childPath = pathPrefix ? `${pathPrefix}.${key}` : key

    if (Object.prototype.hasOwnProperty.call(value, '$value')) {
      const tokenType = typeof value.$type === 'string' ? value.$type : groupType
      out[childPath] = {
        $type: tokenType,
        $value: value.$value,
        $description: typeof value.$description === 'string' ? value.$description : undefined,
        path: childPath,
      }
    } else {
      Object.assign(out, flattenDtcg(value, childPath, groupType))
    }
  }
  return out
}

/**
 * Validates a flattened token map and returns a list of structural issues.
 * Issues that prevent any meaningful import are returned as `kind: 'fatal'`;
 * issues that allow continuation with skips are `kind: 'skip'`.
 *
 * @param {Record<string, { $type: string | undefined, $value: unknown, path: string }>} tokens
 * @returns {Array<{ path: string, kind: 'fatal' | 'skip', code: string, message: string }>}
 */
export function validateTokens(tokens) {
  const issues = []
  for (const [path, token] of Object.entries(tokens)) {
    if (/\s/.test(path)) {
      issues.push({
        path,
        kind: 'fatal',
        code: 'invalid-path-whitespace',
        message: `Token path contains whitespace: "${path}"`,
      })
    }
    if (path.includes('/') || path.includes('"') || path.includes("'")) {
      issues.push({
        path,
        kind: 'fatal',
        code: 'invalid-path-reserved',
        message: `Token path contains reserved characters (/ " '): "${path}"`,
      })
    }
    if (!token.$type) {
      issues.push({
        path,
        kind: 'fatal',
        code: 'missing-type',
        message: `Token "${path}" has no $type and no inherited group type`,
      })
    }
  }
  return issues
}

// ---------- Path conversion ----------

/**
 * DTCG paths use dots; Figma variable names use slashes.
 * @param {string} dottedPath
 * @returns {string}
 */
export function pathToFigmaName(dottedPath) {
  return dottedPath.replace(/\./g, '/')
}

// ---------- Type mapping ----------

/**
 * Maps a DTCG `$type` to a Figma variable resolved type and a status.
 * Status `'supported'` means we can write it; `'skip'` means log and continue.
 *
 * @param {string} dtcgType
 * @returns {{ status: 'supported' | 'skip', figmaType?: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN', reason?: string }}
 */
export function mapType(dtcgType) {
  switch (dtcgType) {
    case 'color':
      return { status: 'supported', figmaType: 'COLOR' }
    case 'dimension':
    case 'number':
    case 'fontWeight':
      return { status: 'supported', figmaType: 'FLOAT' }
    case 'fontFamily':
      return { status: 'supported', figmaType: 'STRING' }
    case 'boolean':
      return { status: 'supported', figmaType: 'BOOLEAN' }
    case 'duration':
    case 'cubicBezier':
      return { status: 'skip', reason: `Figma variables don't support ${dtcgType} natively` }
    case 'shadow':
    case 'gradient':
    case 'typography':
      return { status: 'skip', reason: `Composite type ${dtcgType} is out of scope for v1` }
    default:
      return { status: 'skip', reason: `Unknown $type: ${dtcgType}` }
  }
}

// ---------- Value parsing ----------

/**
 * Parses a hex color string into `{ r, g, b, a }` floats (0..1).
 * Accepts #rgb, #rgba, #rrggbb, #rrggbbaa.
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number, a: number } | null}
 */
export function parseHexColor(hex) {
  if (typeof hex !== 'string') return null
  const m = hex.trim().match(/^#([0-9a-f]{3,8})$/i)
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length === 4) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6 && h.length !== 8) return null

  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
  return { r, g, b, a }
}

/**
 * Parses an `rgb(...)` or `rgba(...)` color into `{ r, g, b, a }` floats.
 * @param {string} rgb
 * @returns {{ r: number, g: number, b: number, a: number } | null}
 */
export function parseRgbColor(rgb) {
  if (typeof rgb !== 'string') return null
  const m = rgb.trim().match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i)
  if (!m) return null
  return {
    r: Math.min(1, parseFloat(m[1]) / 255),
    g: Math.min(1, parseFloat(m[2]) / 255),
    b: Math.min(1, parseFloat(m[3]) / 255),
    a: m[4] !== undefined ? parseFloat(m[4]) : 1,
  }
}

/**
 * Parses any supported DTCG color literal into `{ r, g, b, a }`.
 * Returns `null` if the input is in an unsupported color space (e.g., OKLCH).
 * @param {unknown} value
 * @returns {{ r: number, g: number, b: number, a: number } | null}
 */
export function parseColorValue(value) {
  if (typeof value !== 'string') return null
  return parseHexColor(value) ?? parseRgbColor(value)
}

/**
 * Strips a unit suffix from a dimension string and returns the numeric part.
 * `"16px"` → `16`. `"1rem"` → `1`. `"24"` → `24`. Returns `null` on failure.
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseDimensionValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const m = value.trim().match(/^(-?[0-9]*\.?[0-9]+)([a-z%]*)$/i)
  return m ? parseFloat(m[1]) : null
}

/**
 * Parses a font weight value. Numbers pass through; named weights are rejected.
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseFontWeightValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^[0-9]+$/.test(value.trim())) {
    return parseInt(value.trim(), 10)
  }
  return null
}

/**
 * Resolves a primitive DTCG value into a Figma variable value.
 * Returns `{ ok: true, value }` on success or `{ ok: false, code, message }` on failure.
 *
 * Aliases are NOT resolved here — those are handled in pass 2 of the planner.
 *
 * @param {{ $type: string, $value: unknown, path: string }} token
 * @returns {{ ok: true, value: unknown } | { ok: false, code: string, message: string }}
 */
export function resolvePrimitiveValue(token) {
  if (isAlias(token.$value)) {
    return { ok: false, code: 'is-alias', message: `Token "${token.path}" is an alias` }
  }
  switch (token.$type) {
    case 'color': {
      const c = parseColorValue(token.$value)
      if (!c) {
        return {
          ok: false,
          code: 'unsupported-color',
          message: `Unsupported color value at "${token.path}": ${JSON.stringify(token.$value)}`,
        }
      }
      return { ok: true, value: c }
    }
    case 'dimension':
    case 'number': {
      const n = parseDimensionValue(token.$value)
      if (n === null) {
        return {
          ok: false,
          code: 'unsupported-dimension',
          message: `Unsupported dimension/number value at "${token.path}": ${JSON.stringify(token.$value)}`,
        }
      }
      return { ok: true, value: n }
    }
    case 'fontWeight': {
      const n = parseFontWeightValue(token.$value)
      if (n === null) {
        return {
          ok: false,
          code: 'named-font-weight',
          message: `Named font weights aren't supported at "${token.path}". Use a numeric weight (100..900).`,
        }
      }
      return { ok: true, value: n }
    }
    case 'fontFamily': {
      if (typeof token.$value !== 'string') {
        return {
          ok: false,
          code: 'unsupported-font-family',
          message: `fontFamily must be a string at "${token.path}"`,
        }
      }
      return { ok: true, value: token.$value }
    }
    case 'boolean': {
      if (typeof token.$value !== 'boolean') {
        return {
          ok: false,
          code: 'unsupported-boolean',
          message: `boolean $value must be true/false at "${token.path}"`,
        }
      }
      return { ok: true, value: token.$value }
    }
    default:
      return {
        ok: false,
        code: 'unmapped-type',
        message: `Type "${token.$type}" has no primitive resolver`,
      }
  }
}

// ---------- Plan building ----------

export { collectAliasEdges, isAlias, parseAlias, topologicalSort }

/**
 * Builds the ordered list of operations the Plugin API script will execute.
 *
 * Dependency analysis happens at the **Figma variable name** level — one
 * variable can be set in multiple modes, but it's still one node in the
 * dependency graph. Topological order guarantees an alias target is created
 * before any mode of any variable references it.
 *
 * @param {object} args
 * @param {Record<string, { $type: string, $value: unknown, $description?: string, path: string, collectionName: string, modeName: string }>} args.tokens
 *   Flattened tokens with collection + mode already attached by the orchestrator.
 *   The map key is opaque (currently `<collection>::<mode>::<path>`) — we use
 *   the `path` field on each token, never the key.
 * @param {Map<string, { id: string, type: string, collectionId: string }>} args.existingVarsByName
 *   Current Figma state, keyed by Figma variable name (slash form).
 * @returns {{ operations: object[], skipped: object[], errors: object[] }}
 */
export function buildOperationPlan({ tokens, existingVarsByName }) {
  const operations = []
  const skipped = []
  const errors = []

  // Step 1: project tagged tokens onto the variable-name space. Many tagged
  // tokens collapse onto one Figma variable (e.g., light + dark versions of
  // the same path). Build an index keyed by Figma name.

  const variables = new Map()

  for (const [taggedKey, token] of Object.entries(tokens)) {
    const figmaName = pathToFigmaName(token.path)

    if (!variables.has(figmaName)) {
      variables.set(figmaName, {
        figmaName,
        path: token.path,
        collectionName: token.collectionName,
        $type: token.$type,
        $description: token.$description ?? '',
        modes: [],
      })
    } else {
      const v = variables.get(figmaName)
      if (v.$type !== token.$type) {
        errors.push({
          path: token.path,
          code: 'type-mismatch-across-modes',
          message: `Token "${token.path}" has type "${v.$type}" in one mode and "${token.$type}" in another`,
        })
      }
      if ((token.$description ?? '').length > v.$description.length) {
        v.$description = token.$description ?? ''
      }
    }
    variables.get(figmaName).modes.push({
      modeName: token.modeName,
      $value: token.$value,
      taggedKey,
    })
  }

  if (errors.length > 0) {
    return { operations, skipped, errors }
  }

  // Step 2: filter out unsupported types.
  const supportedVars = new Map()
  for (const [name, v] of variables) {
    const typeMap = mapType(v.$type)
    if (typeMap.status === 'skip') {
      skipped.push({ path: v.path, code: 'unsupported-type', message: typeMap.reason })
      continue
    }
    supportedVars.set(name, { ...v, figmaType: typeMap.figmaType })
  }

  // Step 3: build the variable-level dependency graph. A variable depends on
  // another variable if ANY of its modes aliases that variable.
  const edges = []
  for (const [name, v] of supportedVars) {
    for (const mode of v.modes) {
      const aliasTarget = parseAlias(mode.$value)
      if (aliasTarget !== null) {
        edges.push([name, pathToFigmaName(aliasTarget)])
      }
    }
  }

  const allNames = [...supportedVars.keys()]
  let sortedNames
  try {
    sortedNames = topologicalSort(allNames, edges)
  } catch (err) {
    errors.push({ code: 'cycle', message: err.message })
    return { operations, skipped, errors }
  }

  // Step 4: emit operations in topo order.
  for (const name of sortedNames) {
    const v = supportedVars.get(name)
    const existing = existingVarsByName.get(name)

    if (!existing) {
      operations.push({
        kind: 'create-variable',
        name,
        figmaType: v.figmaType,
        collectionName: v.collectionName,
        description: v.$description,
      })
    } else if (existing.type !== v.figmaType) {
      errors.push({
        path: v.path,
        code: 'type-change',
        message: `Variable "${name}" already exists as ${existing.type} but DTCG declares ${v.figmaType}`,
      })
      continue
    }

    for (const mode of v.modes) {
      if (isAlias(mode.$value)) {
        const targetPath = parseAlias(mode.$value)
        const targetName = pathToFigmaName(targetPath)
        if (!supportedVars.has(targetName) && !existingVarsByName.has(targetName)) {
          skipped.push({
            path: v.path,
            code: 'missing-alias-target',
            message: `Alias target "${targetPath}" not found in DTCG or existing Figma variables`,
          })
          continue
        }
        operations.push({
          kind: 'set-alias',
          name,
          modeName: mode.modeName,
          collectionName: v.collectionName,
          targetName,
        })
      } else {
        const resolved = resolvePrimitiveValue({
          $type: v.$type,
          $value: mode.$value,
          path: v.path,
        })
        if (!resolved.ok) {
          skipped.push({ path: v.path, code: resolved.code, message: resolved.message })
          continue
        }
        operations.push({
          kind: 'set-value',
          name,
          modeName: mode.modeName,
          collectionName: v.collectionName,
          value: resolved.value,
        })
      }
    }
  }

  return { operations, skipped, errors }
}
