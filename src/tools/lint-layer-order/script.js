import { emitScript } from '../../shared/script-emitter.js'

/**
 * Generates a self-contained Plugin API script that runs layer ordering
 * checks inside Figma and returns only the report.
 *
 * This is the MCP path — the script runs in Figma's Plugin API context
 * and has access to `layoutPositioning` and other node properties directly.
 *
 * @param {Object} [options]
 * @param {string[]} [options.pages] - Page names to include
 * @param {string[]} [options.excludePages] - Page names to exclude
 * @returns {string} Plugin API JavaScript to pass to `use_figma`
 */
export function getLayerOrderLintScript(options = {}) {
  const runnerCode = `
const allIssues = [];
let totalComponentSets = 0;

for (const page of figma.root.children) {
  if (page.name === '---') continue;
  if (!shouldIncludePage(page.name)) continue;

  function findSets(node) {
    if (!node.children) return;
    for (const child of node.children) {
      if (child.type === 'COMPONENT_SET') {
        totalComponentSets++;
        const pageIssues = auditLayerOrder({
          id: child.id,
          name: child.name || page.name,
          type: 'CANVAS',
          children: [
            {
              id: child.id,
              name: child.name,
              type: 'COMPONENT_SET',
              children: child.children.map(function(v) {
                return {
                  id: v.id,
                  name: v.name,
                  type: v.type,
                  x: v.x,
                  y: v.y,
                  children: v.children ? v.children.map(function(l) {
                    return {
                      id: l.id,
                      name: l.name,
                      type: l.type,
                      layoutPositioning: l.layoutPositioning || 'AUTO',
                    };
                  }) : [],
                };
              }),
            }
          ],
        });
        for (const issue of pageIssues) {
          issue.pageName = page.name;
          allIssues.push(issue);
        }
      } else if (child.type === 'SECTION' || child.type === 'FRAME') {
        findSets(child);
      }
    }
  }

  findSets(page);
}

const summary = {
  totalComponentSets: totalComponentSets,
  totalIssues: allIssues.length,
  variantInconsistency: allIssues.filter(function(i) { return i.category === 'variantInconsistency'; }).length,
  backgroundPosition: allIssues.filter(function(i) { return i.category === 'backgroundPosition'; }).length,
  overlayPosition: allIssues.filter(function(i) { return i.category === 'overlayPosition'; }).length,
  namingMismatch: allIssues.filter(function(i) { return i.category === 'namingMismatch'; }).length,
  variantOrder: allIssues.filter(function(i) { return i.category === 'variantOrder'; }).length,
};

return {
  title: 'Layer Ordering Lint',
  summary: summary,
  issues: allIssues,
};
`

  return emitScript('lint-layer-order', runnerCode, options, { treeTraversal: true })
}
