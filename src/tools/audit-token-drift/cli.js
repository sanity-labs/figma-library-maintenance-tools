#!/usr/bin/env node
import { loadEnv } from '../../shared/env.js'
import { formatReport, summarizeReport } from '../../shared/cli-utils.js'
import { auditTokenDrift, SANITY_V4_COLLECTION_MAP } from './index.js'

loadEnv()

const HELP_TEXT = `
Usage: figma-audit-token-drift [options]

Detects variable drift between two Figma files. For each pair of matched
collections, resolves every variable's value (walking alias chains) and
reports any variable × mode combination where the resolved values differ.

Typical use: comparing a source-of-truth design file against a library file
to catch when the library's tokens have drifted from their intended values.

Options:
  -t, --token <token>              Figma access token (or set FIGMA_ACCESS_TOKEN)
      --source-file <key>          Source file key (required unless --stdin)
      --source-branch <key>        Optional branch key for the source file
      --target-file <key>          Target file key (required unless --stdin)
      --target-branch <key>        Optional branch key for the target file
      --collection-map <json>      Custom source→target collection name map.
                                    Defaults to the Sanity UI v4 mapping.
                                    Example: '{"Theme":"v4 Theme"}'
      --stdin                      Read both datasets from stdin. The JSON
                                    payload must have this shape:
                                    {
                                      "sourceData": { "meta": {...} },
                                      "targetData": { "meta": {...} }
                                    }
                                    Each "meta" is a local-variables response
                                    from the REST API, or the output of
                                    getLocalVariablesScript via use_figma.
      --summary                    Deduplicate drifts by collection+reason
      --format <fmt>               Output format: json (default) or text
  -h, --help                       Show this help message

Exit codes:
  0  No drift found
  1  Drift detected (report on stdout)
  2  Runtime error

Examples:
  # REST API (requires Enterprise plan for the local-variables endpoint)
  figma-audit-token-drift \\
    --source-file jFAhPbHB82MMW8lxlatsHv \\
    --target-file 5mhVqXlldJEEB2VWZeKQ4i \\
    --target-branch 4ynk7PfeAqEYs22HpoU8T9

  # MCP (no token needed, works on all plans)
  # Step 1: extract via use_figma with getLocalVariablesScript() twice
  # Step 2: save as { "sourceData": <beta>, "targetData": <library> }
  # Step 3:
  cat datasets.json | figma-audit-token-drift --stdin

The default collection map is the Sanity UI v4 mapping. To audit a different
library, pass --collection-map with the appropriate source→target names.
`

/**
 * Parses CLI args for this tool. The shared parseCliArgs doesn't support the
 * source/target split, so we write a dedicated parser.
 */
function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--token' || a === '-t') args.accessToken = argv[++i]
    else if (a === '--source-file') args.sourceFileKey = argv[++i]
    else if (a === '--source-branch') args.sourceBranchKey = argv[++i]
    else if (a === '--target-file') args.targetFileKey = argv[++i]
    else if (a === '--target-branch') args.targetBranchKey = argv[++i]
    else if (a === '--collection-map') args.collectionMapJson = argv[++i]
    else if (a === '--stdin') args.stdin = true
    else if (a === '--summary') args.summary = true
    else if (a === '--format') args.format = argv[++i]
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

async function readStdinJson() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf-8').trim()
  if (!raw) throw new Error('No data received on stdin.')
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new Error(`Failed to parse stdin as JSON: ${e.message}`)
  }
  if (!parsed.sourceData || !parsed.targetData) {
    throw new Error(
      'Stdin payload must have both "sourceData" and "targetData" top-level keys.',
    )
  }
  return parsed
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2))

    if (args.help) {
      console.log(HELP_TEXT)
      process.exit(0)
    }

    const format = args.format === 'text' ? 'text' : 'json'

    let collectionMap = SANITY_V4_COLLECTION_MAP
    if (args.collectionMapJson) {
      try {
        collectionMap = JSON.parse(args.collectionMapJson)
      } catch (e) {
        throw new Error(`--collection-map must be valid JSON: ${e.message}`)
      }
    }

    /** @type {import('./index.js').AuditTokenDriftOptions} */
    const opts = { collectionMap }

    if (args.stdin) {
      const { sourceData, targetData } = await readStdinJson()
      opts.sourceData = sourceData
      opts.targetData = targetData
    } else {
      const accessToken = args.accessToken || process.env.FIGMA_ACCESS_TOKEN
      if (!accessToken) {
        throw new Error(
          'Access token is required. Use --token or set FIGMA_ACCESS_TOKEN. Or use --stdin with pre-fetched data.',
        )
      }
      if (!args.sourceFileKey) throw new Error('--source-file is required (or use --stdin).')
      if (!args.targetFileKey) throw new Error('--target-file is required (or use --stdin).')
      opts.accessToken = accessToken
      opts.sourceFileKey = args.sourceFileKey
      opts.sourceBranchKey = args.sourceBranchKey
      opts.targetFileKey = args.targetFileKey
      opts.targetBranchKey = args.targetBranchKey
    }

    const report = await auditTokenDrift(opts)
    const output = args.summary ? summarizeReport(report) : report
    console.log(formatReport(output, format))

    const hasDrift = report.summary.drifted > 0
      || report.summary.missingSource > 0
      || report.summary.missingTarget > 0
    process.exit(hasDrift ? 1 : 0)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(2)
  }
}

main()
