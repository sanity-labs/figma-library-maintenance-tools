/**
 * Shared alias resolver for DTCG-format design tokens.
 *
 * Used by `figma-import-dtcg-tokens` (write path) and `audit-token-drift`
 * (read path). Both tools must agree on what an alias is, how to walk a
 * chain, and how to detect cycles. That agreement lives here.
 *
 * No I/O, no Figma calls. Pure functions in, pure functions out.
 */

const ALIAS_RE = /^\{([^{}]+)\}$/

/**
 * Returns true if the given DTCG `$value` is an alias reference.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isAlias(value) {
  return typeof value === 'string' && ALIAS_RE.test(value.trim())
}

/**
 * Extracts the dotted target path from a DTCG alias string.
 * Returns `null` if the input isn't an alias.
 * @param {unknown} value
 * @returns {string | null}
 */
export function parseAlias(value) {
  if (typeof value !== 'string') return null
  const match = value.trim().match(ALIAS_RE)
  return match ? match[1].trim() : null
}

/**
 * Walks a flat token map and returns an array of [tokenPath, targetPath]
 * edges for every alias relationship. Non-alias tokens contribute no edges.
 *
 * @param {Record<string, { $value: unknown }>} tokens
 * @returns {Array<[string, string]>}
 */
export function collectAliasEdges(tokens) {
  const edges = []
  for (const [path, token] of Object.entries(tokens)) {
    const target = parseAlias(token?.$value)
    if (target !== null) edges.push([path, target])
  }
  return edges
}

/**
 * Topologically sorts token paths so that primitives come before aliases
 * and aliases come before the aliases that reference them.
 *
 * Throws on cycles. The error message names every node involved.
 *
 * @param {string[]} allPaths      Every token path in the input
 * @param {Array<[string, string]>} edges  [tokenPath, targetPath] pairs from collectAliasEdges
 * @returns {string[]} Paths in dependency order
 */
export function topologicalSort(allPaths, edges) {
  const indegree = new Map(allPaths.map((p) => [p, 0]))
  const dependents = new Map(allPaths.map((p) => [p, []]))

  for (const [from, to] of edges) {
    if (!indegree.has(from)) continue
    if (!indegree.has(to)) continue
    indegree.set(from, indegree.get(from) + 1)
    dependents.get(to).push(from)
  }

  const ready = allPaths.filter((p) => indegree.get(p) === 0)
  const sorted = []

  while (ready.length > 0) {
    const next = ready.shift()
    sorted.push(next)
    for (const dep of dependents.get(next) ?? []) {
      indegree.set(dep, indegree.get(dep) - 1)
      if (indegree.get(dep) === 0) ready.push(dep)
    }
  }

  if (sorted.length !== allPaths.length) {
    const stuck = allPaths.filter((p) => !sorted.includes(p))
    throw new Error(
      `Cycle detected in token aliases. Tokens involved: ${stuck.join(', ')}`,
    )
  }

  return sorted
}

/**
 * Walks the alias chain from a starting token to its leaf value.
 * Returns the leaf token's `$value` (always a non-alias) and the chain of
 * paths walked to get there.
 *
 * Throws on cycle. Returns `{ resolved: undefined, missing: <path> }` when
 * the chain hits a path that doesn't exist in the token map.
 *
 * @param {string} startPath
 * @param {Record<string, { $value: unknown }>} tokens
 * @returns {{ resolved: unknown, chain: string[], missing?: string }}
 */
export function resolveLeaf(startPath, tokens) {
  const chain = []
  let current = startPath

  while (true) {
    if (chain.includes(current)) {
      throw new Error(
        `Cycle while resolving ${startPath}: ${[...chain, current].join(' -> ')}`,
      )
    }
    chain.push(current)

    const token = tokens[current]
    if (!token) return { resolved: undefined, chain, missing: current }

    const target = parseAlias(token.$value)
    if (target === null) {
      return { resolved: token.$value, chain }
    }
    current = target
  }
}
