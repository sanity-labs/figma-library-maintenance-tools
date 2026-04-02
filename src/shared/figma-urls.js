/**
 * @module figma-urls
 * Utilities for building direct Figma URLs that link to specific nodes.
 *
 * All URL-building functions accept an `effectiveFileKey` parameter — this
 * should be the **branch key** when the user is working on a Figma branch,
 * or the **main file key** otherwise.  Callers should resolve the effective
 * key via {@link module:cli-utils.getEffectiveFileKey} before passing it here.
 */

/**
 * Encodes a Figma node ID for use in a URL.
 *
 * Figma node IDs use the format `"1:23"` but URLs represent them as
 * `"1-23"` (colon replaced with hyphen). This function performs that
 * conversion and falls back to standard URI encoding for any other
 * special characters.
 *
 * @param {string} nodeId - A Figma node ID (e.g. "1:23", "45:678")
 * @returns {string} The URL-safe node ID (e.g. "1-23", "45-678")
 *
 * @example
 * encodeNodeId('1:23')   // "1-23"
 * encodeNodeId('45:678') // "45-678"
 * encodeNodeId('0:1')    // "0-1"
 */
export function encodeNodeId(nodeId) {
  return nodeId.replace(/:/g, "-");
}

/**
 * Builds a direct Figma URL that opens a file (or branch) and focuses on a
 * specific node.
 *
 * The returned URL uses the `/design/` path format:
 * `https://www.figma.com/design/<effectiveFileKey>/?node-id=<encodedNodeId>`
 *
 * When the user is working on a Figma branch, pass the **branch file key**
 * as `effectiveFileKey` so the link opens the branch rather than the main
 * file.  Use {@link module:cli-utils.getEffectiveFileKey} to resolve the
 * correct key before calling this function.
 *
 * @param {string} effectiveFileKey - The Figma file key to embed in the URL.
 *   Pass the branch key when targeting a branch, or the main file key otherwise.
 * @param {string} nodeId - The Figma node ID to link to (e.g. "1:23")
 * @returns {string} A fully-qualified Figma URL pointing to the node
 *
 * @example
 * // Main file
 * buildFigmaUrl('abcDEF123', '1:23')
 * // "https://www.figma.com/design/abcDEF123/?node-id=1-23"
 *
 * @example
 * // Branch file — just pass the branch key as effectiveFileKey
 * buildFigmaUrl('branchXYZ', '456:789')
 * // "https://www.figma.com/design/branchXYZ/?node-id=456-789"
 */
export function buildFigmaUrl(effectiveFileKey, nodeId) {
  const encodedNodeId = encodeNodeId(nodeId);
  return `https://www.figma.com/design/${effectiveFileKey}/?node-id=${encodedNodeId}`;
}

/**
 * Adds a `figmaUrl` property to every issue object in an array.
 *
 * This is a convenience function for orchestrators to enrich detection
 * results with direct Figma links after the pure detection phase.  Each
 * issue must have a `nodeId` property (string) which is used to build
 * the URL.
 *
 * When the user is working on a branch, the caller should pass the
 * **effective file key** (i.e. the branch key) so that every generated
 * URL points to the branch rather than the main file.  Orchestrators
 * typically resolve this via:
 *
 * ```js
 * const effectiveKey = getEffectiveFileKey({ fileKey, branchKey })
 * const enrichedIssues = enrichIssuesWithUrls(issues, effectiveKey)
 * ```
 *
 * The function returns a **new** array with new issue objects — the
 * originals are not mutated.
 *
 * @template {Object & { nodeId: string }} T
 * @param {T[]} issues - Array of issue objects, each with a `nodeId` field
 * @param {string} effectiveFileKey - The Figma file key (or branch key) to
 *   use in the generated URLs
 * @returns {(T & { figmaUrl: string })[]} New array of issues with `figmaUrl` added
 *
 * @example
 * // Main file
 * const issues = [{ nodeId: '1:23', layerName: 'Frame 1' }]
 * enrichIssuesWithUrls(issues, 'abcDEF123')
 * // [{ nodeId: '1:23', layerName: 'Frame 1', figmaUrl: 'https://www.figma.com/design/abcDEF123/?node-id=1-23' }]
 *
 * @example
 * // Branch — pass the branch key so URLs open the branch
 * enrichIssuesWithUrls(issues, 'branchXYZ')
 * // [{ nodeId: '1:23', layerName: 'Frame 1', figmaUrl: 'https://www.figma.com/design/branchXYZ/?node-id=1-23' }]
 */
export function enrichIssuesWithUrls(issues, effectiveFileKey) {
  return issues.map((issue) => ({
    ...issue,
    figmaUrl: buildFigmaUrl(effectiveFileKey, issue.nodeId),
  }));
}
