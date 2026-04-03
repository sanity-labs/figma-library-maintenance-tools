#!/usr/bin/env node
import { loadEnv } from "../../shared/env.js";
import { parseCliArgs, formatReport } from "../../shared/cli-utils.js";
import { readStdin } from "../../shared/stdin.js";
import { auditPropertyNames } from "./index.js";

loadEnv();

const HELP_TEXT = `
Usage: figma-audit-properties [options]

Audits component property names against library naming conventions.

Options:
  -f, --file-key <key>    Figma file key (or set FIGMA_FILE_KEY)
  -t, --token <token>     Figma access token (or set FIGMA_ACCESS_TOKEN)
  -b, --branch <key>      Figma branch key (or set FIGMA_BRANCH_KEY)
  -p, --pages <names>     Comma-separated page names to check
      --stdin             Read pre-fetched Figma data from stdin (no token needed)
      --format <fmt>      Output format: json (default) or text
  -h, --help              Show this help message
`;

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
    const report = await auditPropertyNames(config);
    console.log(formatReport(report, config.format));
    process.exit(report.issues.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
}

main();
