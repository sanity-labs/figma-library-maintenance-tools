import { emitScript } from '../../shared/script-emitter.js'

/**
 * Generates a self-contained Plugin API script that runs variant
 * detection inside Figma and returns only the report.
 *
 * @param {Object} [options]
 * @param {string[]} [options.pages] - Page names to include
 * @param {string[]} [options.excludePages] - Page names to exclude
 * @param {boolean} [options.includeGaps=false] - Include coverage gap analysis
 * @returns {string} Plugin API JavaScript to pass to `use_figma`
 */
export function getVariantLintScript(options = {}) {
  const { includeGaps = false } = options

  const runnerCode = `
const INCLUDE_GAPS = ${JSON.stringify(includeGaps)};
const issues = [];
let totalComponentSets = 0;

for (const page of figma.root.children) {
  if (page.name === '---') continue;
  if (!shouldIncludePage(page.name)) continue;

  function findSets(node) {
    if (!node.children) return;
    for (const child of node.children) {
      if (child.type === 'COMPONENT_SET') {
        totalComponentSets++;
        const setIssues = auditComponentSetVariants(
          { name: child.name, id: child.id, children: child.children.map(function(v) { return { name: v.name, id: v.id, type: v.type }; }) },
          { includeGaps: INCLUDE_GAPS }
        );
        for (const issue of setIssues) issues.push(issue);
      } else if (child.type === 'SECTION' || child.type === 'FRAME') {
        findSets(child);
      }
    }
  }

  findSets(page);
}

return {
  title: 'Variant Lint',
  summary: {
    totalComponentSets: totalComponentSets,
    totalIssues: issues.length,
    singleValueVariants: issues.filter(function(i) { return i.issueType === 'single-value-variant'; }).length,
    duplicateVariantNames: issues.filter(function(i) { return i.issueType === 'duplicate-variant-name'; }).length,
    coverageGaps: issues.filter(function(i) { return i.issueType === 'coverage-gap'; }).length,
  },
  issues: issues,
};
`

  return emitScript('lint-variants', runnerCode, options, { treeTraversal: false })
}
