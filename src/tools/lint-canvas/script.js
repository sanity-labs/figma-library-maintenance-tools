import { emitScript } from '../../shared/script-emitter.js'

/**
 * Generates a self-contained Plugin API script that runs canvas
 * hygiene checks inside Figma and returns only the report.
 *
 * @param {Object} [options]
 * @param {string[]} [options.pages] - Page names to include
 * @param {string[]} [options.excludePages] - Page names to exclude
 * @returns {string} Plugin API JavaScript to pass to `use_figma`
 */
export function getCanvasLintScript(options = {}) {
  const runnerCode = `
const issues = [];
let totalPages = 0;

for (const page of figma.root.children) {
  if (page.name === '---') continue;
  if (!shouldIncludePage(page.name)) continue;
  totalPages++;

  const pageData = {
    name: page.name,
    id: page.id,
    children: page.children.map(function(c) { return { x: c.x, y: c.y }; }),
  };

  const pageIssues = auditPage(pageData);
  for (const issue of pageIssues) issues.push(issue);
}

return {
  title: 'Canvas Hygiene Lint',
  summary: {
    totalPages: totalPages,
    totalIssues: issues.length,
    originDrift: issues.filter(function(i) { return i.issueType === 'origin-drift'; }).length,
    nameWhitespace: issues.filter(function(i) { return i.issueType === 'page-name-whitespace'; }).length,
  },
  issues: issues,
};
`

  return emitScript('lint-canvas', runnerCode, options, { treeTraversal: false })
}
