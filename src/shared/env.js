import { config } from 'dotenv'
import { resolve } from 'node:path'

/**
 * Loads environment variables from a `.env` file into `process.env`.
 *
 * Searches for the `.env` file starting from the project root (three levels
 * up from this module's location in `src/shared/`). If the file does not
 * exist, this function is a silent no-op — environment variables that were
 * already set (e.g. via the shell or CI) are never overwritten.
 *
 * This function is idempotent — calling it multiple times has no additional
 * effect because `dotenv` skips variables that already exist in `process.env`.
 *
 * @returns {void}
 *
 * @example
 * // Call once at the top of any CLI entry point:
 * import { loadEnv } from '../../shared/env.js'
 * loadEnv()
 */
export function loadEnv() {
  // Resolve the .env path relative to the package root.
  // This file lives at src/shared/env.js → ../../ is the package root.
  const root = resolve(new URL('.', import.meta.url).pathname, '..', '..')
  config({ path: resolve(root, '.env') })
}
