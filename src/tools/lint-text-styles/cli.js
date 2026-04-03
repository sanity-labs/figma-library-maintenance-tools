#!/usr/bin/env node
import { loadEnv } from "../../shared/env.js";
import { parseCliArgs, formatReport, summarizeReport } from "../../shared/cli-utils.js";
import { readStdin } from "../../shared/stdin.js";
import { lintTextStyles } from "./index.js";

loadEnv();

const HELP_TEXT = `
Usage: figma-lint-text-styles [options]

Detects text nodes with hardcoded type settings (no text style applied).

Options:
  -f, --file-key <key>    Figma file key (or set FIGMA_FILE_KEY)
  -t, --token <token>     Figma access token (or set FIGMA_ACCESS_TOKEN)
  -b, --branch <key>      Figma branch key (or set FIGMA_BRANCH_KEY)
  -p, --pages <names>     Comma-separated page names to check
  -x, --exclude-pages     Comma-separated page names to exclude
  -s, --scope <scope>     Scan scope: all (default) or components
      --stdin             Read pre-fetched Figma data from stdin (no token needed)
      --summary           Deduplicate issues by grouping identical patterns
      --format <fmt>      Output format: json (default) or text
  -h, --help              Show this help message

Stdin JSON may optionally include a "textStylesData" key (array of text style
objects) for suggesting the closest matching style for hardcoded text.
`;

async function main() {
  try {
    const config = parseCliArgs(process.argv.slice(2));
    if (config.help) {
      console.log(HELP_TEXT);
      process.exit(0);
    }
    if (config.stdin) {
      const stdinData = await readStdin();
      config.fileData = stdinData.fileData;
      if (stdinData.textStylesData) {
        config.textStylesData = stdinData.textStylesData;
      }
    }
    const report = await lintTextStyles(config);
    const output = config.summary ? summarizeReport(report) : report;
    console.log(formatReport(output, config.format));
    process.exit(report.issues.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
}

main();
