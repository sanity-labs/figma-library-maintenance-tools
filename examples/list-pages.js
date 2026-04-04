/**
 * Example: List all pages in the file with child counts.
 *
 * A read-only script that surveys the file structure without
 * modifying anything. Returns page names, IDs, and the number
 * of direct children on each page.
 *
 * Usage with Figma MCP:
 *
 *   Pass the contents of this file as the `code` parameter to `use_figma`.
 */

const pages = figma.root.children.map(function (page) {
  return {
    name: page.name,
    id: page.id,
    childCount: page.children.length,
  }
})

return { totalPages: pages.length, pages: pages }
