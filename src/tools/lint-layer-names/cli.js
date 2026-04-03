#!/usr/bin/env node
import { loadEnv } from "../../shared/env.js";
import { parseCliArgs, formatReport } from "../../shared/cli-utils.js";
import { readStdin } from "../../shared/stdin.js";
import { lintLayerNames } from "./index.js";

loadEnv();

const HELP_TEXT = `
Usage: figma-lint-names [options]

Detects generic/default layer names in a Figma file.

Options:
  -f, --file-key <key>    Figma file key (or set FIGMA_FILE_KEY)
  -t, --token <token>     Figma access token (or set FIGMA_ACCESS_TOKEN)
  -b, --branch <key>      Figma branch key (or set FIGMA_BRANCH_KEY)
  -p, --pages <names>          Comma-separated page names to include
  -x, --exclude-pages <names>  Comma-separated page names to exclude
  -s, --scope <scope>          Scan scope: all (default) or components
      --stdin                  Read pre-fetched Figma data from stdin (no token needed)
      --format <fmt>           Output format: json (default) or text
  -h, --help                   Show this help message

Scopes:
  all          Scan every node on every page (default)
  components   Only scan layers inside components

Notes:
  --exclude-pages takes precedence over --pages. Use it to skip scratchpad or
  exploration pages that are not part of the published library.
  Example: figma-lint-names -x ".explorations,.archive"

  --stdin accepts JSON from the Figma MCP use_figma tool or a saved file.
  Example: cat figma-data.json | figma-lint-names --stdin -f <file-key>
`;

/**
 * Main entry point for the generic layer name linter CLI.
 *
 * Parses command-line arguments, runs the linter against the specified
 * Figma file, and prints the report to stdout.
 *
 * Exit codes:
 *   0 — No issues found
 *   1 — One or more generic layer names detected
 *   2 — Runtime error (missing args, API failure, etc.)
 *
 * @returns {Promise<void>}
 */
async function main() {
  try {
    const config = parseCliArgs(process.argv.slice(2));
    if (config.help) {
      console.log(HELP_TEXT);
      process.exit(0);
    }
    if (config.stdin) {
      const { fileData } = await readStdin();
      config.fileData = fileData;
    }
    const report = await lintLayerNames(config);
    console.log(formatReport(report, config.format));
    process.exit(report.issues.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
}

main();
