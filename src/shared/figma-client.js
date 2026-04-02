/**
 * @typedef {Object} FigmaClientOptions
 * @property {string} accessToken - Figma personal access token
 * @property {string} [baseUrl='https://api.figma.com/v1'] - Figma API base URL
 */

/**
 * @typedef {Object} FigmaClient
 * @property {function(string): Promise<Object>} getFile - Fetch a full Figma file
 * @property {function(string, string[]): Promise<Object>} getFileNodes - Fetch specific nodes from a file
 * @property {function(string): Promise<Object>} getFileComponents - Fetch published components from a file
 * @property {function(string): Promise<Object>} getLocalVariables - Fetch local variables from a file
 */

/**
 * Creates a Figma REST API client.
 *
 * @param {FigmaClientOptions} options - Client configuration
 * @returns {FigmaClient} The Figma API client
 * @throws {Error} If accessToken is not provided
 *
 * @example
 * const client = createFigmaClient({ accessToken: 'fig_...' })
 * const file = await client.getFile('abc123')
 */
export function createFigmaClient(options) {
  const { accessToken, baseUrl = 'https://api.figma.com/v1' } = options || {}

  if (!accessToken) {
    throw new Error('Figma access token is required. Set FIGMA_ACCESS_TOKEN environment variable or pass accessToken option.')
  }

  /**
   * Makes an authenticated request to the Figma API.
   *
   * @param {string} endpoint - API endpoint path (e.g., '/files/abc123')
   * @returns {Promise<Object>} Parsed JSON response
   * @throws {Error} If the request fails
   */
  async function request(endpoint) {
    const url = `${baseUrl}${endpoint}`
    const response = await fetch(url, {
      headers: {
        'X-Figma-Token': accessToken,
      },
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Figma API error (${response.status}): ${body}`)
    }

    return response.json()
  }

  return {
    /**
     * Fetches a complete Figma file.
     *
     * @param {string} fileKey - The Figma file key
     * @param {Object} [params] - Optional query parameters
     * @param {number} [params.depth] - Node tree depth to return
     * @param {string} [params.geometry] - Include geometry data ('paths')
     * @param {string} [params.plugin_data] - Include plugin data
     * @returns {Promise<Object>} The complete file data
     */
    async getFile(fileKey, params = {}) {
      const query = new URLSearchParams()
      if (params.depth !== undefined) query.set('depth', String(params.depth))
      if (params.geometry) query.set('geometry', params.geometry)
      if (params.plugin_data) query.set('plugin_data', params.plugin_data)
      const qs = query.toString()
      return request(`/files/${fileKey}${qs ? '?' + qs : ''}`)
    },

    /**
     * Fetches specific nodes from a Figma file.
     *
     * @param {string} fileKey - The Figma file key
     * @param {string[]} nodeIds - Array of node IDs to fetch
     * @returns {Promise<Object>} The requested nodes
     */
    async getFileNodes(fileKey, nodeIds) {
      const ids = nodeIds.join(',')
      return request(`/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`)
    },

    /**
     * Fetches published components from a Figma file.
     *
     * @param {string} fileKey - The Figma file key
     * @returns {Promise<Object>} Published component metadata
     */
    async getFileComponents(fileKey) {
      return request(`/files/${fileKey}/components`)
    },

    /**
     * Fetches local variables from a Figma file.
     *
     * @param {string} fileKey - The Figma file key
     * @returns {Promise<Object>} Local variable collections and variables
     */
    async getLocalVariables(fileKey) {
      return request(`/files/${fileKey}/variables/local`)
    },
  }
}
