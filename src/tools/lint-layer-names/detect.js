import { traverseNodes } from "../../shared/tree-traversal.js";

/**
 * @typedef {Object} GenericNameIssue
 * @property {string} componentName - Name of the containing component or component set
 * @property {string} [variantName] - Name of the variant (if inside a component set)
 * @property {string} layerName - The generic layer name that was detected
 * @property {string} layerType - Figma node type (FRAME, GROUP, RECTANGLE, etc.)
 * @property {string} nodeId - Figma node ID
 * @property {string} parentName - Name of the parent node
 * @property {string[]} childNames - Names of the layer's children
 * @property {string} suggestedName - Suggested rename based on context
 */

/**
 * Regex pattern that matches generic/default Figma layer names.
 *
 * Matches names like "Frame 1", "Group 2", "Rectangle 3", "Vector",
 * "Ellipse 1", "Line 5", "Boolean 1", "Image", etc.
 *
 * The number suffix is optional so bare type names like "Vector" are caught.
 *
 * @type {RegExp}
 */
const GENERIC_NAME_PATTERN =
  /^(Frame|Group|Rectangle|Vector|Ellipse|Line|Polygon|Star|Boolean|Image)\s*\d*$/;

/**
 * Tests whether a layer name is a generic/default Figma name.
 *
 * Generic names are auto-assigned by Figma when a layer is created and
 * follow the pattern `TypeName` or `TypeName N` (e.g. "Frame 1", "Vector").
 *
 * @param {string} name - The layer name to test
 * @returns {boolean} `true` if the name matches the generic pattern
 *
 * @example
 * isGenericName('Frame 1')    // true
 * isGenericName('Vector')     // true
 * isGenericName('icon-frame') // false
 */
export function isGenericName(name) {
  return GENERIC_NAME_PATTERN.test(name);
}

/**
 * Suggests a descriptive replacement name for a generically-named layer.
 *
 * The suggestion strategy is:
 * - If the node has exactly one child, use `{childName}-wrapper`
 * - If the node has multiple children, use `container`
 * - If the node has no children, use the lowercased node type (e.g. `rectangle`)
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} node - The Figma node to generate a suggestion for
 * @returns {string} A suggested descriptive name
 *
 * @example
 * // Node with one child named "icon"
 * suggestName({ type: 'FRAME', children: [{ name: 'icon' }] }) // "icon-wrapper"
 *
 * // Node with multiple children
 * suggestName({ type: 'GROUP', children: [{}, {}] }) // "container"
 *
 * // Leaf node
 * suggestName({ type: 'RECTANGLE', children: [] }) // "rectangle"
 */
export function suggestName(node) {
  const children = node.children || [];

  if (children.length === 1) {
    return `${children[0].name}-wrapper`;
  }

  if (children.length > 1) {
    return "container";
  }

  return node.type.toLowerCase();
}

/**
 * Detects all generic/default layer names within a component node tree.
 *
 * Traverses every descendant of the given component node (but NOT the
 * component node itself, since its name is managed by Figma) and returns
 * an array of {@link GenericNameIssue} objects for each layer whose name
 * matches the generic pattern.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} componentNode - The root component or variant node to inspect
 * @param {string} componentName - Display name of the containing component or component set
 * @param {string|null} variantName - Name of the variant, or `null` for standalone components
 * @returns {GenericNameIssue[]} Array of detected generic-name issues
 *
 * @example
 * const issues = detectGenericNames(variantNode, 'Button', 'State=Hover')
 * // [{ componentName: 'Button', variantName: 'State=Hover', layerName: 'Frame 1', ... }]
 */
export function detectGenericNames(componentNode, componentName, variantName) {
  /** @type {GenericNameIssue[]} */
  const issues = [];

  traverseNodes(componentNode, ({ node, parent, depth }) => {
    // Skip the component node itself (depth 0) — its name is managed by Figma
    if (depth === 0) {
      return;
    }

    if (isGenericName(node.name)) {
      const childNames = (node.children || []).map((child) => child.name);

      /** @type {GenericNameIssue} */
      const issue = {
        componentName,
        layerName: node.name,
        layerType: node.type,
        nodeId: node.id,
        parentName: parent ? parent.name : "",
        childNames,
        suggestedName: suggestName(node),
      };

      if (variantName != null) {
        issue.variantName = variantName;
      }

      issues.push(issue);
    }
  });

  return issues;
}

/**
 * Detects all generic/default layer names across an entire page tree.
 *
 * Unlike {@link detectGenericNames} which scans inside a single component,
 * this function traverses every descendant of the given page node (skipping
 * the page node itself at depth 0). It returns issues for every node whose
 * name matches the generic pattern, regardless of whether the node lives
 * inside a component or not.
 *
 * Each issue's `componentName` is set to `pageName` — a broader context
 * label.  The orchestrator is expected to deduplicate against issues that
 * were already found by the component-scoped detection pass.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} pageNode - A Figma page (CANVAS) node
 * @param {string} pageName - The page name used as context in each issue
 * @returns {GenericNameIssue[]} Array of detected generic-name issues
 *
 * @example
 * const issues = detectGenericNamesOnPage(pageNode, 'Components')
 */
export function detectGenericNamesOnPage(pageNode, pageName) {
  /** @type {GenericNameIssue[]} */
  const issues = [];

  traverseNodes(pageNode, ({ node, parent, depth }) => {
    // Skip the page node itself (depth 0)
    if (depth === 0) {
      return;
    }

    if (isGenericName(node.name)) {
      const childNames = (node.children || []).map((child) => child.name);

      /** @type {GenericNameIssue} */
      const issue = {
        componentName: pageName,
        layerName: node.name,
        layerType: node.type,
        nodeId: node.id,
        parentName: parent ? parent.name : "",
        childNames,
        suggestedName: suggestName(node),
      };

      issues.push(issue);
    }
  });

  return issues;
}
