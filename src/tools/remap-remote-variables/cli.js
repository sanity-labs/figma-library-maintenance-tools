#!/usr/bin/env node
import { loadEnv } from "../../shared/env.js";
import { parseCliArgs, formatReport, summarizeReport } from "../../shared/cli-utils.js";
import { readStdin } from "../../shared/stdin.js";
import { remapRemoteVariables } from "./index.js";

loadEnv();

const HELP_TEXT = `
Usage: figma-remap-variables [options]

Detects variable bindings that reference external (remote) variables instead
of local ones. Each remote binding is classified as "remappable" (a local
variable with the same name exists) or "missing-local" (no match found).

This tool is detection-only — it reports which bindings need remapping but
does not modify the file. Use the companion fix-script.js via the Figma MCP
\`use_figma\` tool to perform the actual rebinding.

Options:
  -f, --file-key <key>    Figma file key (or set FIGMA_FILE_KEY)
  -t, --token <token>     Figma access token (or set FIGMA_ACCESS_TOKEN)
  -b, --branch <key>      Figma branch key (or set FIGMA_BRANCH_KEY)
  -p, --pages <names>     Comma-separated page names to check
  -x, --exclude-pages     Comma-separated page names to exclude
  -s, --scope <scope>     Scan scope: all (default) or components
      --stdin             Read pre-fetched Figma data from stdin (no token needed).
                          Stdin JSON must include both fileData and variablesData.
      --summary           Deduplicate issues by grouping identical patterns
      --format <fmt>      Output format: json (default) or text
  -h, --help              Show this help message

Note: This tool requires variable data for determining local vs remote status.
When using --stdin, the JSON payload must include a "variablesData" key alongside
"fileData".
`;

async function main() {
  try {
    const config = parseCliArgs(process.argv.slice(2));
    if (config.help) {
      console.log(HELP_TEXT);
      process.exit(0);
    }
    if (config.stdin) {
      const { fileData, variablesData } = await readStdin();
      config.fileData = fileData;
      config.variablesData = variablesData;
    }
    const report = await remapRemoteVariables(config);
    const output = config.summary ? summarizeReport(report) : report;
    console.log(formatReport(output, config.format));
    process.exit(report.issues.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
}

main();
