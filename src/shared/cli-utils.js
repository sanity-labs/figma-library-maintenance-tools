/**
 * @typedef {Object} CliConfig
 * @property {string} fileKey - Figma file key
 * @property {string} accessToken - Figma access token
 * @property {string} [branchKey] - Figma branch key (overrides fileKey for API calls when set)
 * @property {string[]} [pages] - Page names to include (empty = all)
 * @property {string[]} [excludePages] - Page names to exclude from the scan (empty = none excluded)
 * @property {'json'|'text'} [format='json'] - Output format
 * @property {'all'|'components'} [scope='all'] - Scan scope for layer-based tools
 */

/**
 * Returns the effective file key to use for API calls.
 *
 * When a branch key is present it takes precedence over the base file key,
 * because Figma branches are accessed via their own unique key through the
 * same REST API endpoints.
 *
 * @param {CliConfig} config - Parsed CLI configuration
 * @returns {string} The file key to use for Figma API requests
 *
 * @example
 * const config = parseCliArgs(['-f', 'main123', '-t', 'tok', '-b', 'branch456'])
 * getEffectiveFileKey(config) // => 'branch456'
 *
 * @example
 * const config = parseCliArgs(['-f', 'main123', '-t', 'tok'])
 * getEffectiveFileKey(config) // => 'main123'
 */
export function getEffectiveFileKey(config) {
  return config.branchKey || config.fileKey;
}

/**
 * Parses CLI arguments into a standard configuration object.
 * Reads from command-line flags and falls back to environment variables.
 *
 * Supported flags:
 *   --file-key, -f       Figma file key
 *   --token, -t          Figma access token
 *   --branch, -b         Figma branch key (uses branch instead of main file)
 *   --pages, -p          Comma-separated page names to include
 *   --exclude-pages, -x  Comma-separated page names to exclude
 *   --format             Output format: 'json' or 'text' (default: 'text')
 *   --scope, -s          Scan scope: 'all' (default) or 'components'
 *   --help, -h           Show help
 *
 * @param {string[]} argv - Process arguments (typically process.argv.slice(2))
 * @param {Object} [env] - Environment variables (defaults to process.env)
 * @returns {CliConfig} Parsed configuration
 * @throws {Error} If required arguments are missing
 */
export function parseCliArgs(argv, env = process.env) {
  const args = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--file-key" || arg === "-f") {
      args.fileKey = argv[++i];
    } else if (arg === "--token" || arg === "-t") {
      args.accessToken = argv[++i];
    } else if (arg === "--branch" || arg === "-b") {
      args.branchKey = argv[++i];
    } else if (arg === "--pages" || arg === "-p") {
      args.pages = argv[++i];
    } else if (arg === "--exclude-pages" || arg === "-x") {
      args.excludePages = argv[++i];
    } else if (arg === "--format") {
      args.format = argv[++i];
    } else if (arg === "--scope" || arg === "-s") {
      args.scope = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }

  if (args.help) {
    return { help: true };
  }

  const fileKey = args.fileKey || env.FIGMA_FILE_KEY;
  const accessToken = args.accessToken || env.FIGMA_ACCESS_TOKEN;
  const branchKey = args.branchKey || env.FIGMA_BRANCH_KEY || undefined;

  if (!fileKey) {
    throw new Error(
      "File key is required. Use --file-key or set FIGMA_FILE_KEY environment variable.",
    );
  }

  if (!accessToken) {
    throw new Error(
      "Access token is required. Use --token or set FIGMA_ACCESS_TOKEN environment variable.",
    );
  }

  const pages = args.pages ? args.pages.split(",").map((p) => p.trim()) : [];
  const excludePages = args.excludePages ? args.excludePages.split(",").map((p) => p.trim()) : [];
  const format = args.format === "text" ? "text" : "json";
  const scope = args.scope === "components" ? "components" : "all";

  /** @type {CliConfig} */
  const config = { fileKey, accessToken, pages, excludePages, format, scope };

  if (branchKey) {
    config.branchKey = branchKey;
  }

  return config;
}

/**
 * Formats a report as either plain text or JSON.
 *
 * @param {Object} report - The report data
 * @param {string} report.title - Report title
 * @param {Object} report.summary - Summary statistics
 * @param {Array} report.issues - Array of issue objects
 * @param {'json'|'text'} format - Output format
 * @returns {string} Formatted report string
 */
export function formatReport(report, format) {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }

  const lines = [];
  lines.push(`\n${"=".repeat(60)}`);
  lines.push(`  ${report.title}`);
  lines.push(`${"=".repeat(60)}\n`);

  if (report.summary) {
    lines.push("Summary:");
    for (const [key, value] of Object.entries(report.summary)) {
      lines.push(`  ${key}: ${value}`);
    }
    lines.push("");
  }

  if (report.issues && report.issues.length > 0) {
    lines.push(`Issues (${report.issues.length}):`);
    lines.push(`${"-".repeat(40)}`);
    for (const issue of report.issues) {
      for (const [key, value] of Object.entries(issue)) {
        lines.push(`  ${key}: ${value}`);
      }
      lines.push("");
    }
  } else {
    lines.push("No issues found. ✓");
  }

  return lines.join("\n");
}
