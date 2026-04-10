#!/usr/bin/env node
import { loadEnv } from '../../shared/env.js'
import { parseCliArgs, formatReport, summarizeReport } from '../../shared/cli-utils.js'
import { readStdin } from '../../shared/stdin.js'
import { lintLayerOrder } from './index.js'

loadEnv()

const HELP_TEXT = `
Usage: figma-lint-layer-order [options]

Audits layer ordering consistency across component set variants.

Checks:
  - Variant consistency: shared layers in same relative order across variants
  - Background position: absolute bg/border layers at bottom of layer panel (first in array)
  - Overlay position: absolute overlay layers at top of layer panel (last in array)
  - Naming mismatch: variants with different layer names from canonical (structural, not ordering)
  - Variant order: variants sorted by canvas position (top-left first in layer panel)

Options:
  -f, --file-key <key>    Figma file key (or set FIGMA_FILE_KEY)
  -t, --token <token>     Figma access token (or set FIGMA_ACCESS_TOKEN)
  -b, --branch <key>      Figma branch key (or set FIGMA_BRANCH_KEY)
  -p, --pages <names>     Comma-separated page names to check
      --stdin             Read pre-fetched Figma data from stdin (no token needed)
      --format <fmt>      Output format: json (default) or text
      --summary           Deduplicate issues by component set pattern
  -h, --help              Show this help message
`

async function main() {
  try {
    const config = parseCliArgs(process.argv.slice(2))
    if (config.help) {
      console.log(HELP_TEXT)
      process.exit(0)
    }
    if (config.stdin) {
      const { fileData } = await readStdin()
      config.fileData = fileData
    }
    let report = await lintLayerOrder(config)
    if (config.summary) {
      report = summarizeReport(report)
    }
    console.log(formatReport(report, config.format))
    process.exit(report.issues.length > 0 ? 1 : 0)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(2)
  }
}

main()
