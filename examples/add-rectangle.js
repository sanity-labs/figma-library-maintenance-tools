/**
 * Example: Add a rectangle to the current page.
 *
 * Creates a 200×100 rectangle with a solid fill on the current page
 * and returns its node ID. Demonstrates a basic write operation via
 * the Plugin API.
 *
 * Usage with Figma MCP:
 *
 *   Pass the contents of this file as the `code` parameter to `use_figma`.
 *
 * Usage with figma-run-script:
 *
 *   figma-run-script examples/add-rectangle.js -f <file-key>
 */

const page = figma.currentPage

const rect = figma.createRectangle()
rect.name = 'example-rectangle'
rect.resize(200, 100)
rect.x = 0
rect.y = 0
rect.fills = [{ type: 'SOLID', color: { r: 0.22, g: 0.27, b: 0.36 } }]
rect.cornerRadius = 8

page.appendChild(rect)

return { nodeId: rect.id, name: rect.name, page: page.name }
