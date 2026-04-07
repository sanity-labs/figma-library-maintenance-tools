import { traverseNodes } from "../../shared/tree-traversal.js";

/**
 * @typedef {Object} UnboundValueIssue
 * @property {string} componentName - Name of the containing component or component set
 * @property {string} [variantName] - Variant name if inside a component set
 * @property {string} layerName - Name of the auto-layout frame
 * @property {string} nodeId - Figma node ID
 * @property {string} property - The unbound property (paddingTop, itemSpacing, etc.)
 * @property {number} rawValue - The raw numeric value
 * @property {'bindable'|'off-scale'|'exception'|'sub-scale'} status - Classification of the value
 * @property {'consumer'|'inherited'} origin - Whether the issue belongs to this component
 *   or is inherited from a source component (instance)
 * @property {string} [sourceComponentName] - Name of the source component when origin is 'inherited'
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
 * @property {'bindable'|'off-scale'|'exception'|'sub-scale'} status - Classification of the value
 * @property {string} [suggestedVariable] - Variable name if status is 'bindable'
 * @property {string} [nearestVariables] - Description of nearest variables if off-scale
 */

/**
 * The minimum spacing scale step in pixels. Values that are positive but
 * below this threshold are classified as 'sub-scale' — intentional
 * structural values for optical alignment that fall below the spacing
 * scale's smallest step. These should be documented as exceptions rather
 * than treated as binding failures.
 *
 * @type {number}
 */
export const SUB_SCALE_THRESHOLD = 2;

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
 * Returns one of four statuses:
 * - `'exception'` — the value is negative and cannot be mapped to a variable
 * - `'sub-scale'` — the value is positive but below {@link SUB_SCALE_THRESHOLD},
 *   indicating a likely intentional structural value for optical alignment
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
 * classifyValue(1, scale)   // => { status: 'sub-scale' }
 * classifyValue(10, scale)  // => { status: 'off-scale', nearestVariables: 'nearest are Space/2=8 and Space/3=12' }
 */
export function classifyValue(rawValue, spaceScale) {
  if (rawValue < 0) {
    return { status: "exception" };
  }

  if (spaceScale.has(rawValue)) {
    return { status: "bindable", suggestedVariable: spaceScale.get(rawValue) };
  }

  // Positive values below the sub-scale threshold that aren't in the scale
  // are likely intentional structural values (e.g. 1px optical alignment)
  if (rawValue > 0 && rawValue < SUB_SCALE_THRESHOLD) {
    return { status: "sub-scale" };
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
 * Determines whether an unbound value on a node is owned by the consuming
 * component ("consumer") or inherited from the source component of an instance
 * ("inherited").
 *
 * For INSTANCE nodes, checks the optional componentMap to find the source
 * component. If the source component has the same property with the same
 * value and is also unbound, the issue belongs to the source — not the consumer.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} node - The node with the unbound value
 * @param {string} property - The unbound property name
 * @param {number} rawValue - The unbound numeric value
 * @param {Map<string, import('../../shared/tree-traversal.js').FigmaNode>} [componentMap] -
 *   Map from component ID to component node. Built from file data.
 * @returns {{ origin: 'consumer'|'inherited', sourceComponentName?: string }}
 *
 * @example
 * classifyOrigin(instanceNode, 'paddingTop', 1, componentMap)
 * // => { origin: 'inherited', sourceComponentName: 'Hotkeys' }
 */
export function classifyOrigin(node, property, rawValue, componentMap) {
  if (node.type !== "INSTANCE" || !componentMap || !node.componentId) {
    return { origin: "consumer" };
  }

  const source = componentMap.get(node.componentId);
  if (!source) {
    return { origin: "consumer" };
  }

  // Check if the source component has the same value and is also unbound
  if (property in source) {
    const sourceValue = source[property];
    const sourceBound = source.boundVariables || {};
    const sourceIsBound = sourceBound[property] && (
      typeof sourceBound[property] === "object" && sourceBound[property].id
    );

    if (sourceValue === rawValue && !sourceIsBound) {
      return { origin: "inherited", sourceComponentName: source.name };
    }
  }

  return { origin: "consumer" };
}

/**
 * Traverses a component tree and detects all auto-layout spacing properties
 * that are not bound to a spacing variable.
 *
 * For every auto-layout node found in the tree, checks each spacing property
 * (padding and gap). Unbound properties are classified against the provided
 * space scale and collected into {@link UnboundValueIssue} objects.
 *
 * When a `componentMap` is provided, INSTANCE nodes are checked against their
 * source component to determine whether unbound values are inherited from the
 * source (fix belongs there) or are consumer-level overrides.
 *
 * Uses {@link traverseNodes} from the shared tree-traversal module for
 * depth-first traversal.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} componentNode - Root node of a component or variant
 * @param {string} componentName - Display name of the containing component or component set
 * @param {string|null} variantName - Variant name when inside a component set, or null for standalone components
 * @param {Map<number, string>} spaceScale - Space scale Map from {@link buildSpaceScale}
 * @param {Map<string, import('../../shared/tree-traversal.js').FigmaNode>} [componentMap] -
 *   Optional map from component ID to component node for origin classification.
 *   When omitted, all findings default to origin 'consumer'.
 * @returns {UnboundValueIssue[]} Array of all unbound auto-layout value issues found
 *
 * @example
 * const issues = detectUnboundValues(variantNode, 'Button', 'Size=Large', spaceScale)
 * // With origin classification:
 * const issues = detectUnboundValues(variantNode, 'Button', 'Size=Large', spaceScale, componentMap)
 */
export function detectUnboundValues(
  componentNode,
  componentName,
  variantName,
  spaceScale,
  componentMap,
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
      const originInfo = classifyOrigin(node, property, rawValue, componentMap);

      /** @type {UnboundValueIssue} */
      const issue = {
        componentName,
        layerName: node.name,
        nodeId: node.id,
        property,
        rawValue,
        status: classification.status,
        origin: originInfo.origin,
      };

      if (variantName !== null && variantName !== undefined) {
        issue.variantName = variantName;
      }

      if (originInfo.sourceComponentName) {
        issue.sourceComponentName = originInfo.sourceComponentName;
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
