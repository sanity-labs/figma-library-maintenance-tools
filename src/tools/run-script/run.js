import { readFileSync, existsSync } from 'node:fs'

/**
 * @typedef {Object} PreparedScript
 * @property {string} code - The script contents ready to pass to `use_figma`
 * @property {string} filePath - The original file path
 */

/**
 * Reads a Plugin API script file from disk and returns its contents.
 *
 * Validates that the file exists and is non-empty. The returned `code`
 * string is ready to be passed directly to the Figma MCP `use_figma`
 * tool as the `code` parameter.
 *
 * @param {string} filePath - Path to a .js file containing Plugin API code
 * @returns {PreparedScript} The script contents and metadata
 * @throws {Error} If the file does not exist or is empty
 *
 * @example
 * const { code } = prepareScript('examples/add-rectangle.js')
 * // Pass `code` to Figma MCP use_figma tool
 */
export function prepareScript(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Script file not found: ${filePath}`)
  }

  const code = readFileSync(filePath, 'utf-8')

  if (!code.trim()) {
    throw new Error(`Script file is empty: ${filePath}`)
  }

  return { code, filePath }
}
