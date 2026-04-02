#!/usr/bin/env node
import { loadEnv } from "../../shared/env.js";
import { parseCliArgs, formatReport } from "../../shared/cli-utils.js";
import { lintDuplicateSiblings } from "./index.js";

loadEnv();

const HELP_TEXT = `
Usage: figma-lint-duplicates [options]

Detects duplicate sibling layer names inside Figma components.

Options:
  -f, --file-key <key>    Figma file key (or set FIGMA_FILE_KEY)
  -t, --token <token>     Figma access token (or set FIGMA_ACCESS_TOKEN)
  -b, --branch <key>      Figma branch key (or set FIGMA_BRANCH_KEY)
  -p, --pages <names>     Comma-separated page names to check
      --format <fmt>      Output format: json (default) or text
  -h, --help              Show this help message
`;

/**
 * Main entry point for the duplicate sibling linter CLI.
 * Parses CLI arguments, runs the linter, formats the report, and exits
 * with an appropriate status code.
 *
 * Exit codes:
 *   0 — no issues found
 *   1 — one or more duplicate sibling issues detected
 *   2 — runtime error (missing args, API failure, etc.)
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
    const report = await lintDuplicateSiblings(config);
    console.log(formatReport(report, config.format));
    process.exit(report.issues.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
}

main();
