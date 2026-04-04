import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * @typedef {Object} EmitOptions
 * @property {string[]} [pages] - Page names to include
 * @property {string[]} [excludePages] - Page names to exclude
 * @property {Object} [toolOptions] - Tool-specific options
 */

/**
 * Reads a source file and strips ESM import/export syntax so the code
 * can run inside Figma's Plugin API sandbox (which has no module system).
 *
 * Handles the patterns used in this codebase:
 * - `import { ... } from '...'` → removed
 * - `export function ...` → `function ...`
 * - `export const ...` → `const ...`
 * - `export { ... }` → removed
 *
 * @param {string} filePath - Absolute path to the .js file
 * @returns {string} File contents with ESM syntax stripped
 */
export function stripEsm(filePath) {
  const source = readFileSync(filePath, 'utf-8')
  return source
    .replace(/^import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?\s*$/gm, '')
    .replace(/^export\s+function\s/gm, 'function ')
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+const\s/gm, 'const ')
}

/**
 * Returns the inlined source of the shared tree-traversal module.
 *
 * @returns {string} Inlined tree-traversal functions
 */
export function getTreeTraversalSource() {
  return stripEsm(resolve(__dirname, 'tree-traversal.js'))
}

/**
 * Returns the inlined source of a tool's detect module.
 *
 * @param {string} toolDir - Tool directory name (e.g. 'lint-variants')
 * @returns {string} Inlined detect functions
 */
export function getDetectSource(toolDir) {
  return stripEsm(resolve(__dirname, '..', 'tools', toolDir, 'detect.js'))
}

/**
 * Builds the page-filtering preamble that every emitted script needs.
 *
 * @param {EmitOptions} options
 * @returns {string} Plugin API JavaScript preamble
 */
export function buildPreamble(options = {}) {
  const { pages, excludePages } = options
  return `
const PAGE_ALLOW = ${JSON.stringify(pages || null)};
const PAGE_DENY = ${JSON.stringify(excludePages || null)};

function shouldIncludePage(name) {
  if (PAGE_DENY && PAGE_DENY.length > 0 && PAGE_DENY.includes(name)) return false;
  if (!PAGE_ALLOW || PAGE_ALLOW.length === 0) return true;
  return PAGE_ALLOW.includes(name);
}
`
}

/**
 * Generates a complete, self-contained Plugin API script for a tool.
 *
 * The emitted script:
 * 1. Inlines shared utilities (tree traversal if needed)
 * 2. Inlines the tool's detection functions
 * 3. Appends tool-specific runner code that walks the file and returns results
 *
 * Detection runs inside Figma. Only the report comes back through MCP —
 * not the raw file tree. This eliminates the "extract data then pipe to
 * CLI" two-step and avoids MCP response size limits.
 *
 * @param {string} toolDir - Tool directory name
 * @param {string} runnerCode - Tool-specific code that calls detect functions and returns a report
 * @param {EmitOptions} options - Page filters
 * @param {Object} [deps]
 * @param {boolean} [deps.treeTraversal=false] - Whether to inline tree-traversal.js
 * @returns {string} Complete Plugin API JavaScript to pass to `use_figma`
 */
export function emitScript(toolDir, runnerCode, options = {}, deps = {}) {
  const parts = []
  parts.push(buildPreamble(options))
  if (deps.treeTraversal) parts.push(getTreeTraversalSource())
  parts.push(getDetectSource(toolDir))
  parts.push(runnerCode)
  return parts.join('\n')
}
