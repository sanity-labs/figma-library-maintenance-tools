import { traverseNodes } from "../../shared/tree-traversal.js";

/**
 * @typedef {Object} UnboundRadiusIssue
 * @property {string} componentName - Name of the containing component or component set
 * @property {string} [variantName] - Variant name if inside a component set
 * @property {string} layerName - Name of the node with hardcoded radius
 * @property {string} layerType - Figma node type (FRAME, RECTANGLE, COMPONENT, etc.)
 * @property {string} nodeId - Figma node ID
 * @property {string} property - The unbound property (topLeftRadius, etc.)
 * @property {number} rawValue - The raw numeric radius value
 * @property {'bindable'|'off-scale'} status - Classification of the value
 * @property {string} [suggestedVariable] - Variable name if status is 'bindable'
 * @property {string} [nearestVariables] - Description of nearest variables if off-scale
 */

/**
 * The border radius properties to check for variable bindings.
 * @type {string[]}
 */
const RADIUS_PROPERTIES = [
  "topLeftRadius",
  "topRightRadius",
  "bottomLeftRadius",
  "bottomRightRadius",
];

/**
 * Checks whether a Figma node has any border radius values set.
 *
 * Returns `true` when at least one of the four corner radius properties
 * exists on the node (even if the value is 0 — zero radius should still
 * be bound to the `0` variable).
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} node
 * @returns {boolean}
 */
export function hasRadiusValues(node) {
  return RADIUS_PROPERTIES.some((prop) => prop in node);
}

/**
 * Finds all radius properties on a node that are not bound to a variable.
 *
 * For each of the four corner radius properties, checks whether the
 * property exists on the node and whether it has a corresponding entry
 * in `node.boundVariables`. Properties that exist but lack a binding
 * are returned.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} node
 * @returns {{ property: string, rawValue: number }[]} Array of unbound property descriptors
 */
export function getUnboundRadiusProperties(node) {
  const unbound = [];
  const bound = node.boundVariables || {};

  for (const property of RADIUS_PROPERTIES) {
    if (property in node) {
      if (!bound[property]) {
        unbound.push({ property, rawValue: node[property] });
      }
    }
  }

  return unbound;
}

/**
 * Classifies a raw numeric radius value against a radius scale.
 *
 * Returns one of two statuses:
 * - `'bindable'` — the value exists in the radius scale and can be directly bound
 * - `'off-scale'` — the value does not match any scale entry; the two closest
 *   scale values are reported for reference
 *
 * @param {number} rawValue - The numeric radius value to classify
 * @param {Map<number, string>} radiusScale - Map from numeric value to variable name
 * @returns {{ status: 'bindable'|'off-scale', suggestedVariable?: string, nearestVariables?: string }}
 */
export function classifyRadiusValue(rawValue, radiusScale) {
  if (radiusScale.has(rawValue)) {
    return { status: "bindable", suggestedVariable: radiusScale.get(rawValue) };
  }

  const scaleValues = Array.from(radiusScale.keys()).sort((a, b) => a - b);

  if (scaleValues.length === 0) {
    return { status: "off-scale", nearestVariables: "no variables in scale" };
  }

  if (scaleValues.length === 1) {
    const val = scaleValues[0];
    return {
      status: "off-scale",
      nearestVariables: `nearest is ${radiusScale.get(val)}=${val}`,
    };
  }

  const sorted = scaleValues
    .map((val) => ({ val, dist: Math.abs(val - rawValue) }))
    .sort((a, b) => a.dist - b.dist || a.val - b.val);

  const pair = [sorted[0], sorted[1]].sort((a, b) => a.val - b.val);
  const pairNames = pair.map((p) => `${radiusScale.get(p.val)}=${p.val}`);

  return {
    status: "off-scale",
    nearestVariables: `nearest are ${pairNames[0]} and ${pairNames[1]}`,
  };
}

/**
 * Builds a radius scale Map from the Figma local variables API response.
 *
 * Scans all variable collections for one whose name contains "radius"
 * (case-insensitive). From that collection, extracts every `FLOAT`-type
 * variable and maps its first mode's resolved value to the variable name.
 *
 * @param {Object} variablesResponse - The Figma local variables API response
 * @returns {Map<number, string>} Map from resolved numeric value to variable name
 */
export function buildRadiusScale(variablesResponse) {
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

  let radiusCollectionId = null;
  for (const [id, collection] of Object.entries(variableCollections)) {
    if (collection.name && /radius/i.test(collection.name)) {
      radiusCollectionId = id;
      break;
    }
  }

  if (!radiusCollectionId) {
    return scale;
  }

  const radiusCollection = variableCollections[radiusCollectionId];
  const modes = radiusCollection.modes || [];
  if (modes.length === 0) {
    return scale;
  }
  const firstModeId = modes[0].modeId;

  for (const [id, variable] of Object.entries(variables)) {
    if (
      variable.variableCollectionId === radiusCollectionId &&
      variable.resolvedType === "FLOAT"
    ) {
      const value = (variable.valuesByMode || {})[firstModeId];
      if (typeof value === "number") {
        scale.set(value, variable.name);
      }
    }
  }

  return scale;
}

/**
 * Traverses a component tree and detects all radius properties that are
 * not bound to a radius variable.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} componentNode - Root node of a component or variant
 * @param {string} componentName - Display name of the containing component
 * @param {string|null} variantName - Variant name when inside a component set, or null
 * @param {Map<number, string>} radiusScale - Radius scale Map from {@link buildRadiusScale}
 * @returns {UnboundRadiusIssue[]}
 */
export function detectUnboundRadiusValues(
  componentNode,
  componentName,
  variantName,
  radiusScale,
) {
  const issues = [];

  traverseNodes(componentNode, ({ node }) => {
    if (!hasRadiusValues(node)) return;

    const unboundProps = getUnboundRadiusProperties(node);

    for (const { property, rawValue } of unboundProps) {
      const classification = classifyRadiusValue(rawValue, radiusScale);

      const issue = {
        componentName,
        layerName: node.name,
        layerType: node.type,
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

/**
 * Page-level scan for unbound radius values on all nodes (not just components).
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} pageNode - A page node
 * @param {Map<number, string>} radiusScale - Radius scale Map
 * @returns {UnboundRadiusIssue[]}
 */
export function detectUnboundRadiusValuesOnPage(pageNode, radiusScale) {
  const issues = [];

  traverseNodes(pageNode, ({ node }) => {
    if (!hasRadiusValues(node)) return;

    const unboundProps = getUnboundRadiusProperties(node);

    for (const { property, rawValue } of unboundProps) {
      const classification = classifyRadiusValue(rawValue, radiusScale);

      const issue = {
        componentName: pageNode.name,
        layerName: node.name,
        layerType: node.type,
        nodeId: node.id,
        property,
        rawValue,
        status: classification.status,
      };

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
