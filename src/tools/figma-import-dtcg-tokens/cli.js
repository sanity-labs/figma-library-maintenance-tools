#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { loadEnv } from '../../shared/env.js'
import { planImport, buildPluginScript, formatPlanSummary } from './index.js'

loadEnv()

const HELP_TEXT = `
Usage: figma-import-dtcg-tokens [options]

Imports W3C DTCG-format design tokens into Figma library variables, including
alias relationships expressed as Figma variable references (not flattened
literal values). Inheritance is preserved through topological ordering.

The tool produces a Plugin API script meant to run via the use_figma MCP tool;
no Figma personal access token is required for the plan step itself.

Options:
      --config <path>          Mapping config file (required)
      --target-branch <key>    Optional Figma branch key
      --dry-run                Plan only, don't write
      --prune                  Remove variables in mapped collections that
                                are absent from DTCG
      --emit-script            Print the Plugin API script (with embedded plan)
                                to stdout for execution via use_figma
      --plan-only              Print the plan summary and exit (default)
      --summary                Deduplicate skip/error output into patterns
      --format <fmt>           Output format: text (default) or json
      --stdin                  Read existing-variables JSON from stdin
                                (skip remote fetch; use with MCP-extracted data)
  -h, --help                   Show this help message

Config shape (relative paths resolved from the config file's directory):

  {
    "collections": [
      {
        "name": "Palette",
        "tokenPrefix": "color.palette",
        "modes": [
          { "name": "default", "file": "tokens/palette.json" }
        ]
      },
      {
        "name": "Theme",
        "tokenPrefix": "color.semantic",
        "modes": [
          { "name": "light", "file": "tokens/light.json" },
          { "name": "dark",  "file": "tokens/dark.json"  }
        ]
      }
    ]
  }

Exit codes:
  0  Plan/import completed without errors (skips are not errors)
  1  Plan contained fatal errors (cycles, type mismatches, etc.)
  2  Argument or config error
`

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--config') args.config = argv[++i]
    else if (a === '--target-branch') args.targetBranchKey = argv[++i]
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--prune') args.prune = true
    else if (a === '--emit-script') args.emitScript = true
    else if (a === '--plan-only') args.planOnly = true
    else if (a === '--summary') args.summary = true
    else if (a === '--format') args.format = argv[++i]
    else if (a === '--stdin') args.stdin = true
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

async function readJsonFromPath(filePath) {
  const text = await readFile(filePath, 'utf-8')
  return JSON.parse(text)
}

async function readStdinJson() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf-8').trim()
  if (!raw) return null
  return JSON.parse(raw)
}

function summarizeByCode(plan) {
  const skipByCode = new Map()
  for (const s of plan.skipped) skipByCode.set(s.code, (skipByCode.get(s.code) ?? 0) + 1)
  const errByCode = new Map()
  for (const e of plan.errors) errByCode.set(e.code, (errByCode.get(e.code) ?? 0) + 1)
  return { skipByCode: [...skipByCode.entries()], errByCode: [...errByCode.entries()] }
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2))

    if (args.help) {
      console.log(HELP_TEXT)
      process.exit(0)
    }

    if (!args.config) {
      console.error('Error: --config is required')
      console.error('Run with --help for usage.')
      process.exit(2)
    }

    const configPath = resolve(args.config)
    const config = await readJsonFromPath(configPath)
    const configDir = dirname(configPath)

    const readJson = (filePath) => readJsonFromPath(resolve(configDir, filePath))

    let existingVarsByName = new Map()
    if (args.stdin) {
      const parsed = await readStdinJson()
      const variables = parsed?.meta?.variables ?? parsed?.variables ?? {}
      for (const v of Object.values(variables)) {
        if (v?.name && v?.resolvedType) {
          existingVarsByName.set(v.name, {
            id: v.id,
            type: v.resolvedType,
            collectionId: v.variableCollectionId,
          })
        }
      }
    }

    const { plan, declaredVarNames } = await planImport({
      config,
      readJson,
      existingVarsByName,
    })

    if (args.emitScript) {
      const script = buildPluginScript({
        declaredVarNames,
        dryRun: !!args.dryRun,
        prune: !!args.prune,
      })
      const wrapped = `var __plan = ${JSON.stringify(plan)};\n${script}`
      process.stdout.write(wrapped)
      process.exit(plan.errors.length > 0 ? 1 : 0)
    }

    if (args.format === 'json') {
      process.stdout.write(JSON.stringify({ plan, declaredVarNames }, null, 2) + '\n')
    } else {
      console.log(formatPlanSummary(plan))
      if (args.summary) {
        const { skipByCode, errByCode } = summarizeByCode(plan)
        console.log('')
        console.log('Patterns:')
        for (const [code, n] of skipByCode) console.log(`  skip:${code}  ${n}`)
        for (const [code, n] of errByCode) console.log(`  error:${code}  ${n}`)
      }
    }

    process.exit(plan.errors.length > 0 ? 1 : 0)
  } catch (err) {
    console.error('Fatal:', err.message)
    process.exit(1)
  }
}

main()
