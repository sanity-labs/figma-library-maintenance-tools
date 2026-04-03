/**
 * @module stdin
 *
 * Utility for reading pre-fetched Figma data from stdin.  Used by CLI
 * wrappers when the `--stdin` flag is set, allowing tools to run against
 * data extracted via the Figma MCP `use_figma` tool without needing a
 * REST API token.
 *
 * The expected stdin format is a JSON object with one or two top-level keys:
 *
 * ```json
 * {
 *   "fileData": { "document": { ... } },
 *   "variablesData": { "meta": { ... } }
 * }
 * ```
 *
 * `variablesData` is only required by the autolayout linter.  All other
 * tools only need `fileData`.
 */

/**
 * Reads all data from stdin and parses it as JSON.
 *
 * @returns {Promise<{ fileData: Object, variablesData?: Object }>}
 *   Parsed stdin payload containing at least `fileData`
 * @throws {Error} If stdin is empty, not valid JSON, or missing `fileData`
 *
 * @example
 * // Pipe MCP output into a tool:
 * // cat mcp-output.json | figma-lint-names --stdin -f <file-key>
 *
 * const { fileData, variablesData } = await readStdin()
 */
export async function readStdin() {
  const chunks = []

  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim()

  if (!raw) {
    throw new Error(
      'No data received on stdin. Pipe JSON data from the Figma MCP use_figma tool or a saved file.',
    )
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new Error(`Failed to parse stdin as JSON: ${e.message}`)
  }

  // Accept either a wrapped payload { fileData, variablesData } or a bare
  // file object { document: { ... } }.  The bare format is what the MCP
  // use_figma script returns directly.
  if (parsed.document) {
    return { fileData: parsed }
  }

  if (!parsed.fileData) {
    throw new Error(
      'Invalid stdin payload: expected a JSON object with a "fileData" key ' +
      '(containing the Figma document tree) or a bare object with a "document" key.',
    )
  }

  return parsed
}
