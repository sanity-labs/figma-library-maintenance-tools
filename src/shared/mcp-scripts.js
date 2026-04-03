/**
 * @module mcp-scripts
 *
 * Figma Plugin API scripts for extracting file data via the MCP `use_figma`
 * tool.  Each script returns data in the same shape as the corresponding
 * Figma REST API endpoint, so the downstream detect functions work
 * identically regardless of how the data was fetched.
 *
 * These scripts are designed to be passed as the `code` parameter to the
 * Figma MCP `use_figma` tool from Claude Desktop (or any MCP client).
 *
 * Usage from Claude Desktop / MCP client:
 *
 * ```js
 * import { getFileScript, getLocalVariablesScript } from './mcp-scripts.js'
 *
 * // 1. Extract file data via MCP
 * const fileData = await figmaMcp.use_figma({
 *   code: getFileScript({ pageNames: ['Components'] }),
 *   fileKey: '...',
 *   description: 'Extract file tree for lint tools',
 * })
 *
 * // 2. Pass directly to any tool orchestrator
 * const report = await lintLayerNames({ fileData, fileKey: '...' })
 * ```
 */

/**
 * Builds a Plugin API script that extracts the file's document tree.
 *
 * The returned data mirrors the shape of `GET /v1/files/:key`:
 *
 * ```json
 * {
 *   "document": {
 *     "id": "0:0",
 *     "name": "Document",
 *     "type": "DOCUMENT",
 *     "children": [ ...pages ]
 *   }
 * }
 * ```
 *
 * Each node in the tree includes: `id`, `name`, `type`, `children`,
 * `layoutMode`, padding/gap values, `boundVariables`, `fills`,
 * `componentPropertyDefinitions`, and `description`.
 *
 * @param {Object} [options]
 * @param {string[]} [options.pageNames] - Only include these pages (omit for all)
 * @param {number} [options.depth] - Max tree depth (omit for full depth)
 * @returns {string} Plugin API JavaScript code to pass to `use_figma`
 */
export function getFileScript(options = {}) {
  const { pageNames, depth } = options

  // The script is a self-contained string that runs inside Figma's Plugin API.
  // It must not reference any outer scope — everything is inlined.
  return `
const PAGE_FILTER = ${JSON.stringify(pageNames || null)};
const MAX_DEPTH = ${depth !== undefined ? depth : 'Infinity'};

function extractNode(node, currentDepth) {
  const n = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  // Description (components and component sets)
  if ('description' in node && node.description) {
    n.description = node.description;
  }

  // Component property definitions (component sets and standalone components)
  if ('componentPropertyDefinitions' in node && node.componentPropertyDefinitions) {
    n.componentPropertyDefinitions = node.componentPropertyDefinitions;
  }

  // Auto-layout properties
  if ('layoutMode' in node && node.layoutMode && node.layoutMode !== 'NONE') {
    n.layoutMode = node.layoutMode;
    n.paddingTop = node.paddingTop;
    n.paddingRight = node.paddingRight;
    n.paddingBottom = node.paddingBottom;
    n.paddingLeft = node.paddingLeft;
    n.itemSpacing = node.itemSpacing;
    n.primaryAxisSizingMode = node.primaryAxisSizingMode;
    n.counterAxisSizingMode = node.counterAxisSizingMode;
  }

  // Bound variables — resolve variable IDs to names for downstream tools
  if ('boundVariables' in node && node.boundVariables) {
    const bv = {};
    let hasBound = false;
    for (const [prop, binding] of Object.entries(node.boundVariables)) {
      if (!binding) continue;
      if (Array.isArray(binding)) {
        bv[prop] = binding.map(function(b) {
          try {
            const v = figma.variables.getVariableById(b.id);
            return { id: b.id, name: v ? v.name : undefined };
          } catch(e) { return { id: b.id }; }
        });
      } else {
        try {
          const v = figma.variables.getVariableById(binding.id);
          bv[prop] = { id: binding.id, name: v ? v.name : undefined };
        } catch(e) { bv[prop] = { id: binding.id }; }
      }
      hasBound = true;
    }
    if (hasBound) n.boundVariables = bv;
  }

  // Fills (for color-related audits)
  if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
    n.fills = node.fills.map(function(f) {
      const fill = { type: f.type, visible: f.visible !== false };
      if (f.type === 'SOLID' && f.color) {
        fill.color = {
          r: f.color.r,
          g: f.color.g,
          b: f.color.b,
          a: f.opacity !== undefined ? f.opacity : 1,
        };
      }
      return fill;
    });
  }

  // Text properties
  if (node.type === 'TEXT') {
    n.characters = node.characters;
    if (typeof node.fontSize === 'number') n.fontSize = node.fontSize;
  }

  // Children — recurse if within depth limit
  if ('children' in node && node.children && currentDepth < MAX_DEPTH) {
    n.children = node.children.map(function(child) {
      return extractNode(child, currentDepth + 1);
    });
  }

  return n;
}

// Build the document structure matching REST API shape
const pages = figma.root.children.filter(function(page) {
  if (!PAGE_FILTER) return true;
  return PAGE_FILTER.includes(page.name);
});

const document = {
  id: figma.root.id,
  name: figma.root.name,
  type: 'DOCUMENT',
  children: pages.map(function(page) { return extractNode(page, 0); }),
};

return { document: document };
`
}

/**
 * Builds a Plugin API script that extracts local variables, mirroring the
 * shape of `GET /v1/files/:key/variables/local`.
 *
 * The autolayout linter uses this to build a space scale from the file's
 * variable collections.
 *
 * Returned shape:
 * ```json
 * {
 *   "meta": {
 *     "variableCollections": { "<collectionId>": { ... } },
 *     "variables": { "<variableId>": { ... } }
 *   }
 * }
 * ```
 *
 * @returns {string} Plugin API JavaScript code to pass to `use_figma`
 */
export function getLocalVariablesScript() {
  return `
const collections = figma.variables.getLocalVariableCollections();
const variableCollections = {};
const variables = {};

for (const collection of collections) {
  variableCollections[collection.id] = {
    id: collection.id,
    name: collection.name,
    modes: collection.modes,
    variableIds: collection.variableIds,
  };

  for (const varId of collection.variableIds) {
    try {
      const v = figma.variables.getVariableById(varId);
      if (!v) continue;

      const valuesByMode = {};
      for (const [modeId, value] of Object.entries(v.valuesByMode)) {
        // Resolve aliases
        if (value && typeof value === 'object' && value.type === 'VARIABLE_ALIAS') {
          valuesByMode[modeId] = { type: 'VARIABLE_ALIAS', id: value.id };
        } else {
          valuesByMode[modeId] = value;
        }
      }

      variables[v.id] = {
        id: v.id,
        name: v.name,
        key: v.key,
        variableCollectionId: v.variableCollectionId,
        resolvedType: v.resolvedType,
        valuesByMode: valuesByMode,
      };
    } catch(e) {
      // Skip variables that can't be read
    }
  }
}

return {
  meta: {
    variableCollections: variableCollections,
    variables: variables,
  },
};
`
}
