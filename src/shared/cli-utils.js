/**
 * @typedef {Object} CliConfig
 * @property {string} fileKey - Figma file key
 * @property {string} [accessToken] - Figma access token (not required when using --stdin)
 * @property {string} [branchKey] - Figma branch key (overrides fileKey for API calls when set)
 * @property {string[]} [pages] - Page names to include (empty = all)
 * @property {string[]} [excludePages] - Page names to exclude from the scan (empty = none excluded)
 * @property {'json'|'text'} [format='json'] - Output format
 * @property {'all'|'components'} [scope='all'] - Scan scope for layer-based tools
 * @property {boolean} [stdin] - When true, read pre-fetched Figma data from stdin (no token needed)
 * @property {boolean} [summary] - When true, deduplicate issues by grouping identical patterns
 * @property {string[]} [collections] - Variable collection names to include (empty = all)
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
 *   --exclude-pages, -x  Comma-separated page names to exclude (or set FIGMA_EXCLUDE_PAGES)
 *   --format             Output format: 'json' or 'text' (default: 'text')
 *   --scope, -s          Scan scope: 'all' (default) or 'components'
 *   --collections, -c    Comma-separated collection names to include in variable lookups
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
    } else if (arg === "--collections" || arg === "-c") {
      args.collections = argv[++i];
    } else if (arg === "--stdin") {
      args.stdin = true;
    } else if (arg === "--summary") {
      args.summary = true;
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
  const stdin = args.stdin || false;

  if (!fileKey) {
    throw new Error(
      "File key is required. Use --file-key or set FIGMA_FILE_KEY environment variable.",
    );
  }

  if (!stdin && !accessToken) {
    throw new Error(
      "Access token is required. Use --token or set FIGMA_ACCESS_TOKEN environment variable. Alternatively, use --stdin to pipe pre-fetched data.",
    );
  }

  const pages = args.pages ? args.pages.split(",").map((p) => p.trim()) : [];
  const rawExclude = args.excludePages || env.FIGMA_EXCLUDE_PAGES || "";
  const excludePages = rawExclude ? rawExclude.split(",").map((p) => p.trim()).filter(Boolean) : [];
  const collections = args.collections ? args.collections.split(",").map((c) => c.trim()) : [];
  const format = args.format === "text" ? "text" : "json";
  const scope = args.scope === "components" ? "components" : "all";
  const summary = args.summary || false;

  /** @type {CliConfig} */
  const config = { fileKey, pages, excludePages, collections, format, scope, stdin, summary };

  if (accessToken) {
    config.accessToken = accessToken;
  }

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

/**
 * Deduplicates a report's issues by grouping identical patterns.
 *
 * Groups issues by a composite key of shared properties (excluding unique
 * identifiers like `nodeId`, `variantName`, and `figmaUrl`). Each group
 * becomes a single entry with an `occurrences` count.
 *
 * The original report's `summary` and `title` are preserved. The `issues`
 * array is replaced with the deduplicated patterns, sorted by occurrence
 * count (highest first).
 *
 * @param {Object} report - A report object with `title`, `summary`, and `issues`
 * @param {string[]} [groupByKeys] - Property names to group by. If omitted, all
 *   properties except `nodeId`, `variantName`, and `figmaUrl` are used.
 * @returns {Object} A new report with deduplicated `issues` and a
 *   `uniquePatterns` count added to `summary`
 */
export function summarizeReport(report, groupByKeys) {
  if (!report.issues || report.issues.length === 0) {
    return { ...report, summary: { ...report.summary, uniquePatterns: 0 } };
  }

  /** @type {string[]} */
  const excludeKeys = ["nodeId", "variantName", "figmaUrl"];

  const groups = new Map();

  for (const issue of report.issues) {
    const keyParts = [];
    const groupEntry = {};

    for (const [key, value] of Object.entries(issue)) {
      if (excludeKeys.includes(key)) continue;
      if (groupByKeys && !groupByKeys.includes(key)) continue;
      keyParts.push(`${key}=${value}`);
      groupEntry[key] = value;
    }

    const compositeKey = keyParts.join("|");

    if (groups.has(compositeKey)) {
      groups.get(compositeKey).occurrences++;
    } else {
      groups.set(compositeKey, { ...groupEntry, occurrences: 1 });
    }
  }

  const patterns = Array.from(groups.values()).sort(
    (a, b) => b.occurrences - a.occurrences,
  );

  return {
    title: report.title,
    summary: { ...report.summary, uniquePatterns: patterns.length },
    issues: patterns,
  };
}
