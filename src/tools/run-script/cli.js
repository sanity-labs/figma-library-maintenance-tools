#!/usr/bin/env node
import { prepareScript } from './run.js'

const HELP_TEXT = `
Usage: figma-run-script <script-path>

Reads a Plugin API script file and outputs its contents to stdout.
Pass the output to the Figma MCP use_figma tool to execute it.

Arguments:
  script-path     Path to a .js file containing Figma Plugin API code

Options:
  -h, --help      Show this help message

Example:
  figma-run-script examples/add-rectangle.js

  # In an agentic workflow, the agent reads the output and passes it
  # to use_figma as the code parameter.

Writing custom scripts:
  Scripts run inside Figma's Plugin API sandbox. They have access to the
  figma global but cannot import modules or make network requests. Use
  return to send results back.

  See examples/ for working scripts and the README for full documentation.
`

function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(HELP_TEXT)
    process.exit(0)
  }

  const scriptPath = args[0]

  try {
    const { code } = prepareScript(scriptPath)
    console.log(code)
    process.exit(0)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(2)
  }
}

main()
