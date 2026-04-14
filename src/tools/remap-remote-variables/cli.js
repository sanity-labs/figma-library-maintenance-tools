#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../../shared/env.js";
import { parseCliArgs, formatReport, summarizeReport } from "../../shared/cli-utils.js";
import { readStdin } from "../../shared/stdin.js";
import { remapRemoteVariables } from "./index.js";

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));

const HELP_TEXT = `
Usage: figma-remap-variables [options]

Detects variable bindings that reference external (remote) variables instead
of local ones. Each remote binding is classified as "remappable" (a local
variable with the same name exists) or "missing-local" (no match found).

Options:
  -f, --file-key <key>       Figma file key (or set FIGMA_FILE_KEY)
  -t, --token <token>        Figma access token (or set FIGMA_ACCESS_TOKEN)
  -b, --branch <key>         Figma branch key (or set FIGMA_BRANCH_KEY)
  -p, --pages <names>        Comma-separated page names to check
  -x, --exclude-pages        Comma-separated page names to exclude
  -s, --scope <scope>        Scan scope: all (default) or components
  -c, --collections <names>  Comma-separated collection names to include in
                              the variable lookup (default: all collections).
                              Use this to avoid WASM memory limits on large files.
      --stdin                Read pre-fetched Figma data from stdin (no token needed).
                              Stdin JSON must include both fileData and variablesData.
      --summary              Deduplicate issues by grouping identical patterns
      --format <fmt>         Output format: json (default) or text
  -h, --help                 Show this help message

Fix script generation:
      --emit-fix             Instead of running detection, emit a ready-to-run
                              Plugin API fix script to stdout. Combine with
                              --node and --collections to parameterize:

                              figma-remap-variables --emit-fix \\
                                --node 30123:80806 \\
                                --collections "v4 Theme,v4 Element tone"

      --node <id>            Target node ID for the fix script (required with --emit-fix)

The emitted script can be passed directly to use_figma:

  figma-remap-variables --emit-fix --node 30123:80806 \\
    -c "v4 Theme" | figma-run-script -

Or saved to a file:

  figma-remap-variables --emit-fix --node 30123:80806 > fix.js

Note: The detection mode requires variable data. When using --stdin, the JSON
payload must include a "variablesData" key alongside "fileData".
`;

/**
 * Parses tool-specific arguments (--emit-fix, --node) from argv.
 * These are parsed before handing off to the shared parseCliArgs.
 */
function parseToolArgs(argv) {
  const toolArgs = { emitFix: false, nodeId: null };
  const remaining = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--emit-fix") {
      toolArgs.emitFix = true;
    } else if (arg === "--node") {
      toolArgs.nodeId = argv[++i];
    } else {
      remaining.push(arg);
    }
  }

  return { toolArgs, remaining };
}

/**
 * Reads the fix-script.js template and replaces configuration placeholders.
 */
function emitFixScript(nodeId, collections) {
  const templatePath = resolve(__dirname, "fix-script.js");
  let script = readFileSync(templatePath, "utf-8");

  script = script.replace("__TARGET_NODE_ID__", nodeId);

  if (collections && collections.length > 0) {
    script = script.replace(
      "__COLLECTION_FILTER__",
      JSON.stringify(collections),
    );
  } else {
    script = script.replace("__COLLECTION_FILTER__", "null");
  }

  return script;
}

async function main() {
  try {
    const { toolArgs, remaining } = parseToolArgs(process.argv.slice(2));

    // Check for help first
    if (remaining.includes("--help") || remaining.includes("-h")) {
      console.log(HELP_TEXT);
      process.exit(0);
    }

    // ── Emit-fix mode ─────────────────────────────────────────────────
    if (toolArgs.emitFix) {
      if (!toolArgs.nodeId) {
        console.error(
          "Error: --node <id> is required when using --emit-fix.\n" +
          "Example: figma-remap-variables --emit-fix --node 30123:80806",
        );
        process.exit(2);
      }

      // Parse collections from remaining args (doesn't need file-key/token)
      let collections = [];
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i] === "--collections" || remaining[i] === "-c") {
          collections = remaining[i + 1]
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean);
          break;
        }
      }

      const script = emitFixScript(toolArgs.nodeId, collections);
      console.log(script);
      process.exit(0);
    }

    // ── Detection mode (default) ──────────────────────────────────────
    const config = parseCliArgs(remaining);
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
