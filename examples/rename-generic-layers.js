/**
 * Example: Rename generic layers on the current page.
 *
 * Finds all layers on the current page with Figma default names
 * (Frame 1, Group 2, Rectangle 3, etc.) and renames them based on
 * their type and position in the tree. Returns a count of renamed
 * layers.
 *
 * This is a write operation — it modifies the file.
 *
 * Usage with Figma MCP:
 *
 *   Pass the contents of this file as the `code` parameter to `use_figma`.
 */

var GENERIC_PATTERN = /^(Frame|Group|Rectangle|Vector|Ellipse|Line)\s*\d*$/
var renamed = []

function walk(node, depth) {
  if (GENERIC_PATTERN.test(node.name)) {
    var newName = node.type.toLowerCase()
    if (node.children && node.children.length === 1) {
      newName = node.children[0].name + '-wrapper'
    } else if (node.children && node.children.length > 1) {
      newName = 'container'
    }
    var oldName = node.name
    node.name = newName
    renamed.push({ oldName: oldName, newName: newName, nodeId: node.id })
  }

  if (node.children) {
    for (var i = 0; i < node.children.length; i++) {
      walk(node.children[i], depth + 1)
    }
  }
}

var page = figma.currentPage
for (var i = 0; i < page.children.length; i++) {
  walk(page.children[i], 0)
}

return { totalRenamed: renamed.length, renamed: renamed }
