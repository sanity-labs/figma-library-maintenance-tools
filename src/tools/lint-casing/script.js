import { emitScript } from '../../shared/script-emitter.js'

/**
 * Generates a self-contained Plugin API script that runs casing
 * detection inside Figma and returns only the report.
 *
 * @param {Object} [options]
 * @param {string[]} [options.pages] - Page names to include
 * @param {string[]} [options.excludePages] - Page names to exclude
 * @param {boolean} [options.textOnly=true] - Only check TEXT layers
 * @returns {string} Plugin API JavaScript to pass to `use_figma`
 */
export function getCasingLintScript(options = {}) {
  const { textOnly = true } = options

  const runnerCode = `
const TEXT_ONLY = ${JSON.stringify(textOnly)};
const issues = [];
let totalComponents = 0;

function extractNode(n) {
  const out = { name: n.name, type: n.type, id: n.id };
  if (n.children && n.children.length > 0) {
    out.children = n.children.map(extractNode);
  }
  return out;
}

for (const page of figma.root.children) {
  if (page.name === '---') continue;
  if (!shouldIncludePage(page.name)) continue;

  function findComponents(node) {
    if (!node.children) return;
    for (const child of node.children) {
      if (child.type === 'COMPONENT_SET') {
        const variants = child.children.filter(function(v) { return v.type === 'COMPONENT'; });
        totalComponents += variants.length;
        for (const variant of variants) {
          const extracted = extractNode(variant);
          const vi = detectCasingIssues(extracted, child.name, variant.name, { textOnly: TEXT_ONLY });
          for (const issue of vi) issues.push(issue);
        }
      } else if (child.type === 'COMPONENT') {
        totalComponents++;
        const extracted = extractNode(child);
        const ci = detectCasingIssues(extracted, child.name, null, { textOnly: TEXT_ONLY });
        for (const issue of ci) issues.push(issue);
      } else if (child.type === 'SECTION' || child.type === 'FRAME') {
        findComponents(child);
      }
    }
  }

  findComponents(page);
}

return {
  title: 'Layer Casing Lint',
  summary: { totalComponents: totalComponents, totalIssues: issues.length, textOnly: TEXT_ONLY },
  issues: issues,
};
`

  return emitScript('lint-casing', runnerCode, options, { treeTraversal: true })
}
