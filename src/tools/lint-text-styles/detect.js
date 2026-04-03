import { traverseNodes } from "../../shared/tree-traversal.js";

/**
 * @typedef {Object} HardcodedTextIssue
 * @property {string} componentName - Name of the containing component or component set
 * @property {string} [variantName] - Variant name if inside a component set
 * @property {string} layerName - Name of the text node
 * @property {string} nodeId - Figma node ID
 * @property {number} [fontSize] - The hardcoded font size (if available)
 * @property {string} [fontFamily] - The hardcoded font family (if available)
 * @property {string} [fontStyle] - The hardcoded font style/weight (if available)
 * @property {string} [suggestedStyle] - Name of the closest matching text style (if found)
 */

/**
 * Checks whether a text node has hardcoded type settings — meaning it
 * has no text style applied.
 *
 * A text node is considered hardcoded when its `textStyleId` is empty,
 * missing, or blank.  Nodes with a valid `textStyleId` reference a
 * shared text style and are considered bound.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} node - A TEXT node
 * @returns {boolean} `true` when the text node has no text style applied
 *
 * @example
 * isHardcodedText({ type: 'TEXT', textStyleId: '' })     // true
 * isHardcodedText({ type: 'TEXT' })                       // true
 * isHardcodedText({ type: 'TEXT', textStyleId: 'S:abc' }) // false
 */
export function isHardcodedText(node) {
  if (node.type !== "TEXT") return false;
  const styleId = node.textStyleId;
  return !styleId || styleId.trim() === "";
}

/**
 * Builds a lookup of text styles from the Figma local text styles.
 *
 * Maps font size + style combinations to style names for suggesting
 * the closest match when a text node has hardcoded settings.
 *
 * @param {Object[]} textStyles - Array of text style objects from the API
 *   or Plugin API's `getLocalTextStyles()`. Each must have `name`,
 *   `fontSize`, and `fontName` properties.
 * @returns {Map<string, string>} Map from `"{fontSize}:{fontStyle}"` to style name
 *
 * @example
 * const styles = [{ name: 'Text 1/Medium', fontSize: 13, fontName: { family: 'Inter', style: 'Medium' } }]
 * buildTextStyleMap(styles) // Map { '13:Medium' => 'Text 1/Medium' }
 */
export function buildTextStyleMap(textStyles) {
  const map = new Map();

  if (!textStyles || !Array.isArray(textStyles)) return map;

  for (const style of textStyles) {
    if (!style.name || !style.fontSize) continue;
    const fontStyle =
      style.fontName && style.fontName.style ? style.fontName.style : "Regular";
    const key = `${style.fontSize}:${fontStyle}`;
    map.set(key, style.name);
  }

  return map;
}

/**
 * Attempts to find the closest matching text style for a hardcoded text node.
 *
 * Looks up the node's `fontSize` and `fontStyle` combination in the style map.
 * If no exact match is found, tries matching on font size alone.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} node - A TEXT node
 * @param {Map<string, string>} textStyleMap - Map from {@link buildTextStyleMap}
 * @returns {string|undefined} The suggested style name, or undefined if no match
 */
export function suggestTextStyle(node, textStyleMap) {
  if (!node.fontSize) return undefined;

  const fontStyle =
    node.fontName && node.fontName.style ? node.fontName.style : "Regular";
  const exactKey = `${node.fontSize}:${fontStyle}`;

  if (textStyleMap.has(exactKey)) {
    return textStyleMap.get(exactKey);
  }

  // Try matching on font size alone (any style)
  for (const [key, name] of textStyleMap) {
    if (key.startsWith(`${node.fontSize}:`)) {
      return name;
    }
  }

  return undefined;
}

/**
 * Traverses a component tree and detects all text nodes with hardcoded
 * type settings (no text style applied).
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} componentNode - Root node
 * @param {string} componentName - Display name of the containing component
 * @param {string|null} variantName - Variant name or null for standalone components
 * @param {Map<string, string>} textStyleMap - Text style map from {@link buildTextStyleMap}
 * @returns {HardcodedTextIssue[]}
 */
export function detectHardcodedText(
  componentNode,
  componentName,
  variantName,
  textStyleMap,
) {
  const issues = [];

  traverseNodes(componentNode, ({ node }) => {
    if (!isHardcodedText(node)) return;

    const issue = {
      componentName,
      layerName: node.name,
      nodeId: node.id,
    };

    if (variantName !== null && variantName !== undefined) {
      issue.variantName = variantName;
    }

    if (node.fontSize !== undefined) {
      issue.fontSize = node.fontSize;
    }

    if (node.fontName) {
      if (node.fontName.family) issue.fontFamily = node.fontName.family;
      if (node.fontName.style) issue.fontStyle = node.fontName.style;
    }

    const suggested = suggestTextStyle(node, textStyleMap);
    if (suggested) {
      issue.suggestedStyle = suggested;
    }

    issues.push(issue);
  });

  return issues;
}

/**
 * Page-level scan for hardcoded text nodes on all nodes (not just components).
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} pageNode - A page node
 * @param {Map<string, string>} textStyleMap - Text style map
 * @returns {HardcodedTextIssue[]}
 */
export function detectHardcodedTextOnPage(pageNode, textStyleMap) {
  const issues = [];

  traverseNodes(pageNode, ({ node }) => {
    if (!isHardcodedText(node)) return;

    const issue = {
      componentName: pageNode.name,
      layerName: node.name,
      nodeId: node.id,
    };

    if (node.fontSize !== undefined) {
      issue.fontSize = node.fontSize;
    }

    if (node.fontName) {
      if (node.fontName.family) issue.fontFamily = node.fontName.family;
      if (node.fontName.style) issue.fontStyle = node.fontName.style;
    }

    const suggested = suggestTextStyle(node, textStyleMap);
    if (suggested) {
      issue.suggestedStyle = suggested;
    }

    issues.push(issue);
  });

  return issues;
}
