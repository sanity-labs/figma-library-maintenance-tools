import { traverseNodes } from "../../shared/tree-traversal.js";

/**
 * @typedef {Object} UnboundValueIssue
 * @property {string} componentName - Name of the containing component or component set
 * @property {string} [variantName] - Variant name if inside a component set
 * @property {string} layerName - Name of the auto-layout frame
 * @property {string} nodeId - Figma node ID
 * @property {string} property - The unbound property (paddingTop, itemSpacing, etc.)
 * @property {number} rawValue - The raw numeric value
 * @property {'bindable'|'off-scale'|'exception'} status - Classification of the value
 * @property {string} [suggestedVariable] - Variable name if status is 'bindable'
 * @property {string} [nearestVariables] - Description of nearest variables if off-scale
 */

/**
 * @typedef {Object} UnboundProperty
 * @property {string} property - The property name (e.g. 'paddingTop', 'itemSpacing')
 * @property {number} rawValue - The raw numeric value on the node
 */

/**
 * @typedef {Object} ClassifyResult
 * @property {'bindable'|'off-scale'|'exception'} status - Classification of the value
 * @property {string} [suggestedVariable] - Variable name if status is 'bindable'
 * @property {string} [nearestVariables] - Description of nearest variables if off-scale
 */

/**
 * The auto-layout spacing properties to check for variable bindings.
 * @type {string[]}
 */
const AUTO_LAYOUT_PROPERTIES = [
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "itemSpacing",
];

/**
 * Checks whether a Figma node is an auto-layout frame.
 *
 * A node is considered auto-layout if its `layoutMode` property is set to
 * either "HORIZONTAL" or "VERTICAL". Nodes with `layoutMode` of "NONE",
 * absent, or undefined are not auto-layout.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} node - A Figma node to inspect
 * @returns {boolean} `true` when the node uses auto-layout
 *
 * @example
 * isAutoLayoutNode({ layoutMode: 'HORIZONTAL' }) // => true
 * isAutoLayoutNode({ layoutMode: 'NONE' })       // => false
 * isAutoLayoutNode({})                            // => false
 */
export function isAutoLayoutNode(node) {
  return node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL";
}

/**
 * Finds all auto-layout spacing properties on a node that are not bound to a variable.
 *
 * For each of the five auto-layout properties (paddingTop, paddingRight,
 * paddingBottom, paddingLeft, itemSpacing), checks whether the property
 * exists on the node and whether it has a corresponding entry in
 * `node.boundVariables`. Properties that exist but lack a binding are
 * returned. If `boundVariables` is missing entirely, all existing
 * properties are considered unbound.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} node - An auto-layout Figma node
 * @returns {UnboundProperty[]} Array of unbound property descriptors
 *
 * @example
 * const node = {
 *   paddingTop: 8, paddingRight: 16,
 *   paddingBottom: 8, paddingLeft: 16,
 *   itemSpacing: 4,
 *   boundVariables: {
 *     paddingTop: { id: 'var1', type: 'VARIABLE_ALIAS' },
 *   },
 * }
 * getUnboundProperties(node)
 * // => [
 * //   { property: 'paddingRight', rawValue: 16 },
 * //   { property: 'paddingBottom', rawValue: 8 },
 * //   { property: 'paddingLeft', rawValue: 16 },
 * //   { property: 'itemSpacing', rawValue: 4 },
 * // ]
 */
export function getUnboundProperties(node) {
  /** @type {UnboundProperty[]} */
  const unbound = [];
  const bound = node.boundVariables || {};

  for (const property of AUTO_LAYOUT_PROPERTIES) {
    if (property in node) {
      if (!bound[property]) {
        unbound.push({ property, rawValue: node[property] });
      }
    }
  }

  return unbound;
}

/**
 * Classifies a raw numeric spacing value against a space scale.
 *
 * Returns one of three statuses:
 * - `'exception'` — the value is negative and cannot be mapped to a variable
 * - `'bindable'` — the value exists in the space scale and can be directly bound
 * - `'off-scale'` — the value does not match any scale entry; the two closest
 *   scale values are reported for reference
 *
 * @param {number} rawValue - The numeric spacing value to classify
 * @param {Map<number, string>} spaceScale - Map from numeric value to variable name
 * @returns {ClassifyResult} Classification result with status and optional suggestions
 *
 * @example
 * const scale = new Map([[0, 'Space/0'], [4, 'Space/1'], [8, 'Space/2'], [12, 'Space/3']])
 * classifyValue(8, scale)   // => { status: 'bindable', suggestedVariable: 'Space/2' }
 * classifyValue(-4, scale)  // => { status: 'exception' }
 * classifyValue(10, scale)  // => { status: 'off-scale', nearestVariables: 'nearest are Space/2=8 and Space/3=12' }
 */
export function classifyValue(rawValue, spaceScale) {
  if (rawValue < 0) {
    return { status: "exception" };
  }

  if (spaceScale.has(rawValue)) {
    return { status: "bindable", suggestedVariable: spaceScale.get(rawValue) };
  }

  // Find the two closest values in the scale
  const scaleValues = Array.from(spaceScale.keys()).sort((a, b) => a - b);

  if (scaleValues.length === 0) {
    return { status: "off-scale", nearestVariables: "no variables in scale" };
  }

  if (scaleValues.length === 1) {
    const val = scaleValues[0];
    const name = spaceScale.get(val);
    return {
      status: "off-scale",
      nearestVariables: `nearest is ${name}=${val}`,
    };
  }

  // Sort by distance to rawValue, then by value for stable ordering
  const sorted = scaleValues
    .map((val) => ({ val, dist: Math.abs(val - rawValue) }))
    .sort((a, b) => a.dist - b.dist || a.val - b.val);

  const first = sorted[0];
  const second = sorted[1];
  const firstName = spaceScale.get(first.val);
  const secondName = spaceScale.get(second.val);

  // Present in ascending order of value
  const pair = [first, second].sort((a, b) => a.val - b.val);
  const pairNames = pair.map((p) => `${spaceScale.get(p.val)}=${p.val}`);

  return {
    status: "off-scale",
    nearestVariables: `nearest are ${pairNames[0]} and ${pairNames[1]}`,
  };
}

/**
 * Builds a space scale Map from the Figma local variables API response.
 *
 * Scans all variable collections for one whose name contains "space"
 * (case-insensitive). From that collection, extracts every `FLOAT`-type
 * variable and maps its first mode's resolved value to the variable name.
 *
 * @param {Object} variablesResponse - The Figma local variables API response
 * @param {Object} variablesResponse.meta - Metadata wrapper
 * @param {Object} variablesResponse.meta.variableCollections - Map of collection ID → collection object
 * @param {Object} variablesResponse.meta.variables - Map of variable ID → variable object
 * @returns {Map<number, string>} Map from resolved numeric value to variable name
 *
 * @example
 * const response = {
 *   meta: {
 *     variableCollections: {
 *       'coll1': { id: 'coll1', name: 'Space', modes: [{ modeId: 'm1' }] },
 *     },
 *     variables: {
 *       'v1': { name: 'Space/0', resolvedType: 'FLOAT', variableCollectionId: 'coll1', valuesByMode: { 'm1': 0 } },
 *       'v2': { name: 'Space/1', resolvedType: 'FLOAT', variableCollectionId: 'coll1', valuesByMode: { 'm1': 4 } },
 *     },
 *   },
 * }
 * buildSpaceScale(response) // => Map { 0 => 'Space/0', 4 => 'Space/1' }
 */
export function buildSpaceScale(variablesResponse) {
  /** @type {Map<number, string>} */
  const scale = new Map();

  if (
    !variablesResponse ||
    !variablesResponse.meta ||
    !variablesResponse.meta.variableCollections ||
    !variablesResponse.meta.variables
  ) {
    return scale;
  }

  const { variableCollections, variables } = variablesResponse.meta;

  // Find the Space collection (case-insensitive match on "space")
  let spaceCollectionId = null;
  for (const [id, collection] of Object.entries(variableCollections)) {
    if (collection.name && /spac(e|ing)/i.test(collection.name)) {
      spaceCollectionId = id;
      break;
    }
  }

  if (!spaceCollectionId) {
    return scale;
  }

  const spaceCollection = variableCollections[spaceCollectionId];

  // Get the first mode ID from the collection
  const modes = spaceCollection.modes || [];
  if (modes.length === 0) {
    return scale;
  }
  const firstModeId = modes[0].modeId;

  // Extract FLOAT variables belonging to the Space collection
  for (const [id, variable] of Object.entries(variables)) {
    if (
      variable.variableCollectionId === spaceCollectionId &&
      variable.resolvedType === "FLOAT"
    ) {
      const valuesByMode = variable.valuesByMode || {};
      const value = valuesByMode[firstModeId];

      if (typeof value === "number") {
        scale.set(value, variable.name);
      }
    }
  }

  return scale;
}

/**
 * Traverses a component tree and detects all auto-layout spacing properties
 * that are not bound to a spacing variable.
 *
 * For every auto-layout node found in the tree, checks each spacing property
 * (padding and gap). Unbound properties are classified against the provided
 * space scale and collected into {@link UnboundValueIssue} objects.
 *
 * Uses {@link traverseNodes} from the shared tree-traversal module for
 * depth-first traversal.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} componentNode - Root node of a component or variant
 * @param {string} componentName - Display name of the containing component or component set
 * @param {string|null} variantName - Variant name when inside a component set, or null for standalone components
 * @param {Map<number, string>} spaceScale - Space scale Map from {@link buildSpaceScale}
 * @returns {UnboundValueIssue[]} Array of all unbound auto-layout value issues found
 *
 * @example
 * const issues = detectUnboundValues(variantNode, 'Button', 'Size=Large', spaceScale)
 */
export function detectUnboundValues(
  componentNode,
  componentName,
  variantName,
  spaceScale,
) {
  /** @type {UnboundValueIssue[]} */
  const issues = [];

  traverseNodes(componentNode, ({ node }) => {
    if (!isAutoLayoutNode(node)) {
      return;
    }

    const unboundProps = getUnboundProperties(node);

    for (const { property, rawValue } of unboundProps) {
      const classification = classifyValue(rawValue, spaceScale);

      /** @type {UnboundValueIssue} */
      const issue = {
        componentName,
        layerName: node.name,
        nodeId: node.id,
        property,
        rawValue,
        status: classification.status,
      };

      if (variantName !== null && variantName !== undefined) {
        issue.variantName = variantName;
      }

      if (classification.suggestedVariable) {
        issue.suggestedVariable = classification.suggestedVariable;
      }

      if (classification.nearestVariables) {
        issue.nearestVariables = classification.nearestVariables;
      }

      issues.push(issue);
    }
  });

  return issues;
}
