#!/usr/bin/env node
import { loadEnv } from "../../shared/env.js";
import { parseCliArgs, formatReport } from "../../shared/cli-utils.js";
import { auditPropertyNames } from "./index.js";

loadEnv();

const HELP_TEXT = `
Usage: figma-audit-properties [options]

Audits component property naming conventions in a Figma library.

Options:
  -f, --file-key <key>    Figma file key (or set FIGMA_FILE_KEY)
  -t, --token <token>     Figma access token (or set FIGMA_ACCESS_TOKEN)
  -b, --branch <key>      Figma branch key (or set FIGMA_BRANCH_KEY)
  -p, --pages <names>     Comma-separated page names to check
      --format <fmt>      Output format: json (default) or text
  -h, --help              Show this help message
`;

/**
 * Main entry point for the property naming convention audit CLI.
 *
 * Parses command-line arguments, runs the audit against the specified
 * Figma file, formats the resulting report, and exits with an appropriate
 * status code:
 *   - 0 if no issues were found
 *   - 1 if one or more naming violations were detected
 *   - 2 if a runtime error occurred (e.g. missing arguments, API failure)
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
    const report = await auditPropertyNames(config);
    console.log(formatReport(report, config.format));
    process.exit(report.issues.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
}

main();
