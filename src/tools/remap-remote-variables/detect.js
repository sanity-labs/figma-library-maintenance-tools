import { traverseNodes } from "../../shared/tree-traversal.js";

/**
 * @typedef {Object} RemoteBindingIssue
 * @property {string} componentName - Name of the containing component or component set
 * @property {string} [variantName] - Variant name if inside a component set
 * @property {string} layerName - Name of the node with the remote binding
 * @property {string} layerType - Figma node type
 * @property {string} nodeId - Figma node ID
 * @property {string} field - The bound property (fills, topLeftRadius, paddingLeft, etc.)
 * @property {string} remoteVariableId - The remote variable's ID
 * @property {string} remoteVariableName - The remote variable's name
 * @property {'remappable'|'missing-local'} status - Classification
 * @property {string} [localVariableId] - Local variable ID if status is 'remappable'
 * @property {string} [localVariableName] - Local variable name if status is 'remappable'
 */

/**
 * Builds a set of all local variable IDs from the Figma local variables
 * API response.
 *
 * Used to determine whether a bound variable is local (in the set) or
 * remote (not in the set).
 *
 * @param {Object} variablesResponse - The Figma local variables API response
 * @returns {Set<string>} Set of local variable IDs
 */
export function buildLocalVariableIdSet(variablesResponse) {
  const ids = new Set();

  if (
    !variablesResponse ||
    !variablesResponse.meta ||
    !variablesResponse.meta.variables
  ) {
    return ids;
  }

  for (const id of Object.keys(variablesResponse.meta.variables)) {
    ids.add(id);
  }

  return ids;
}

/**
 * Builds a name-to-variable lookup from the local variables API response.
 *
 * When multiple local variables share the same name (rare but possible across
 * collections), the first one encountered wins. The caller can refine matching
 * by collection if needed.
 *
 * @param {Object} variablesResponse - The Figma local variables API response
 * @returns {Map<string, { id: string, name: string, collectionId: string, resolvedType: string }>}
 */
export function buildLocalVariablesByName(variablesResponse) {
  const byName = new Map();

  if (
    !variablesResponse ||
    !variablesResponse.meta ||
    !variablesResponse.meta.variables
  ) {
    return byName;
  }

  for (const variable of Object.values(variablesResponse.meta.variables)) {
    if (!byName.has(variable.name)) {
      byName.set(variable.name, {
        id: variable.id,
        name: variable.name,
        collectionId: variable.variableCollectionId,
        resolvedType: variable.resolvedType,
      });
    }
  }

  return byName;
}

/**
 * Extracts the resolved variable name from a bound variable entry in the
 * REST API / MCP file data.
 *
 * In data extracted via the MCP `getFileScript`, each binding includes a
 * `name` field alongside the `id`. In REST API data, only the `id` is
 * present — the name must be looked up from the variables response.
 *
 * @param {Object} binding - A single bound variable entry ({ id, name? })
 * @param {Object} variablesResponse - The local variables API response (for REST API fallback)
 * @returns {string|null} The variable name, or null if unresolvable
 */
export function resolveVariableName(binding, variablesResponse) {
  if (!binding) return null;

  // MCP-extracted data includes the name directly
  if (binding.name) return binding.name;

  // REST API path: look up by ID in the variables response
  if (
    binding.id &&
    variablesResponse &&
    variablesResponse.meta &&
    variablesResponse.meta.variables
  ) {
    const variable = variablesResponse.meta.variables[binding.id];
    if (variable) return variable.name;
  }

  return null;
}

/**
 * Checks whether a bound variable is remote (not in the local variable set).
 *
 * @param {Object} binding - A single bound variable entry ({ id })
 * @param {Set<string>} localIds - Set of local variable IDs
 * @returns {boolean} True if the variable is remote
 */
export function isRemoteBinding(binding, localIds) {
  if (!binding || !binding.id) return false;
  return !localIds.has(binding.id);
}

/**
 * Detects all remote variable bindings on a single node.
 *
 * Inspects `boundVariables` for each property, checking whether the
 * referenced variable ID exists in the local variable set. For remote
 * bindings, attempts to find a local variable with the same name.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} node - A Figma node
 * @param {Set<string>} localIds - Set of local variable IDs
 * @param {Map<string, Object>} localByName - Local variables indexed by name
 * @param {Object} variablesResponse - The local variables API response (for name resolution)
 * @returns {{ field: string, remoteVariableId: string, remoteVariableName: string, status: 'remappable'|'missing-local', localVariableId?: string, localVariableName?: string }[]}
 */
export function detectRemoteBindingsOnNode(
  node,
  localIds,
  localByName,
  variablesResponse,
) {
  const issues = [];
  const bound = node.boundVariables || {};

  for (const [field, binding] of Object.entries(bound)) {
    const bindings = Array.isArray(binding) ? binding : [binding];

    for (const b of bindings) {
      if (!b || !b.id) continue;
      if (!isRemoteBinding(b, localIds)) continue;

      const remoteName = resolveVariableName(b, variablesResponse);

      if (!remoteName) {
        issues.push({
          field,
          remoteVariableId: b.id,
          remoteVariableName: "(unknown)",
          status: "missing-local",
        });
        continue;
      }

      const localMatch = localByName.get(remoteName);

      if (localMatch) {
        issues.push({
          field,
          remoteVariableId: b.id,
          remoteVariableName: remoteName,
          status: "remappable",
          localVariableId: localMatch.id,
          localVariableName: localMatch.name,
        });
      } else {
        issues.push({
          field,
          remoteVariableId: b.id,
          remoteVariableName: remoteName,
          status: "missing-local",
        });
      }
    }
  }

  return issues;
}

/**
 * Traverses a component subtree and detects all remote variable bindings.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} componentNode - Root node of a component or variant
 * @param {string} componentName - Display name of the containing component
 * @param {string|null} variantName - Variant name when inside a component set, or null
 * @param {Set<string>} localIds - Set of local variable IDs
 * @param {Map<string, Object>} localByName - Local variables indexed by name
 * @param {Object} variablesResponse - The local variables API response
 * @returns {RemoteBindingIssue[]}
 */
export function detectRemoteBindings(
  componentNode,
  componentName,
  variantName,
  localIds,
  localByName,
  variablesResponse,
) {
  const issues = [];

  traverseNodes(componentNode, ({ node }) => {
    const nodeIssues = detectRemoteBindingsOnNode(
      node,
      localIds,
      localByName,
      variablesResponse,
    );

    for (const found of nodeIssues) {
      const issue = {
        componentName,
        layerName: node.name,
        layerType: node.type,
        nodeId: node.id,
        ...found,
      };

      if (variantName !== null && variantName !== undefined) {
        issue.variantName = variantName;
      }

      issues.push(issue);
    }
  });

  return issues;
}

/**
 * Page-level scan for remote variable bindings on all nodes.
 *
 * @param {import('../../shared/tree-traversal.js').FigmaNode} pageNode - A page node
 * @param {Set<string>} localIds - Set of local variable IDs
 * @param {Map<string, Object>} localByName - Local variables indexed by name
 * @param {Object} variablesResponse - The local variables API response
 * @returns {RemoteBindingIssue[]}
 */
export function detectRemoteBindingsOnPage(
  pageNode,
  localIds,
  localByName,
  variablesResponse,
) {
  const issues = [];

  traverseNodes(pageNode, ({ node }) => {
    const nodeIssues = detectRemoteBindingsOnNode(
      node,
      localIds,
      localByName,
      variablesResponse,
    );

    for (const found of nodeIssues) {
      issues.push({
        componentName: pageNode.name,
        layerName: node.name,
        layerType: node.type,
        nodeId: node.id,
        ...found,
      });
    }
  });

  return issues;
}
