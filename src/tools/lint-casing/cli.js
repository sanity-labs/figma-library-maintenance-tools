#!/usr/bin/env node
import { loadEnv } from '../../shared/env.js'
import { parseCliArgs, formatReport } from '../../shared/cli-utils.js'
import { readStdin } from '../../shared/stdin.js'
import { lintCasing } from './index.js'
import { getCasingLintScript } from './script.js'

loadEnv()

const HELP_TEXT = `
Usage: figma-lint-casing [options]

Detects layer name casing violations inside Figma components.

Options:
  -f, --file-key <key>    Figma file key (or set FIGMA_FILE_KEY)
  -t, --token <token>     Figma access token (or set FIGMA_ACCESS_TOKEN)
  -b, --branch <key>      Figma branch key (or set FIGMA_BRANCH_KEY)
  -p, --pages <names>          Comma-separated page names to include
  -x, --exclude-pages <names>  Comma-separated page names to exclude
      --all-layers             Check all layer types, not just TEXT
      --stdin                  Read pre-fetched Figma data from stdin
      --emit-script            Output a Plugin API script for use_figma instead of running analysis
      --format <fmt>           Output format: json (default) or text
  -h, --help                   Show this help message
`

async function main() {
  try {
    const rawArgs = process.argv.slice(2)
    const config = parseCliArgs(rawArgs)
    if (config.help) { console.log(HELP_TEXT); process.exit(0) }

    const textOnly = !rawArgs.includes('--all-layers')

    if (rawArgs.includes('--emit-script')) {
      console.log(getCasingLintScript({ pages: config.pages, excludePages: config.excludePages, textOnly }))
      process.exit(0)
    }

    if (config.stdin) { const { fileData } = await readStdin(); config.fileData = fileData }
    const report = await lintCasing({ ...config, textOnly })
    console.log(formatReport(report, config.format))
    process.exit(report.issues.length > 0 ? 1 : 0)
  } catch (err) { console.error(`Error: ${err.message}`); process.exit(2) }
}

main()
