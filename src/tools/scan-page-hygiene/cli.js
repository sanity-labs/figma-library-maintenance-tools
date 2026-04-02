#!/usr/bin/env node

import { loadEnv } from "../../shared/env.js";
import { parseCliArgs, formatReport } from "../../shared/cli-utils.js";
import { scanPageHygiene } from "./index.js";

loadEnv();

/**
 * Help text displayed when the user passes `--help` or `-h`.
 * @type {string}
 */
const HELP_TEXT = `
Usage: figma-scan-pages [options]

Scans for non-component items at the top level of published Figma pages.

Options:
  -f, --file-key <key>    Figma file key (or set FIGMA_FILE_KEY)
  -t, --token <token>     Figma access token (or set FIGMA_ACCESS_TOKEN)
  -b, --branch <key>      Figma branch key (or set FIGMA_BRANCH_KEY)
  -p, --pages <names>     Comma-separated page names to check
      --format <fmt>      Output format: json (default) or text
  -h, --help              Show this help message
`;

/**
 * Main entry point for the scan-page-hygiene CLI tool.
 *
 * Parses command-line arguments, runs the page hygiene scan against the
 * specified Figma file, and prints the formatted report to stdout.
 *
 * Exit codes:
 * - `0` — no unexpected items found
 * - `1` — one or more unexpected items detected
 * - `2` — runtime error (missing args, network failure, etc.)
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

    const report = await scanPageHygiene(config);
    console.log(formatReport(report, config.format));
    process.exit(report.issues.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
}

main();
