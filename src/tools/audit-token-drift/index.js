import { createFigmaClient } from '../../shared/figma-client.js'
import { getEffectiveFileKey } from '../../shared/cli-utils.js'
import { buildSnapshot, diffSnapshots } from './detect.js'

/**
 * @typedef {import('./detect.js').VariableDataset} VariableDataset
 * @typedef {import('./detect.js').CollectionDiff} CollectionDiff
 */

/**
 * Default collection name mapping for the Sanity UI v4 audit.
 * Keys are source collection names (beta file); values are the matching
 * target collection names (library file).
 *
 * Callers can override via the `collectionMap` option.
 *
 * @type {Object<string, string>}
 */
export const SANITY_V4_COLLECTION_MAP = {
  'Theme': 'v4 Theme',
  'Color scheme': 'v4 Color scheme',
  'Card tone': 'v4 Card tone',
  'Avatar color': 'v4 Avatar color',
  'Element tone': 'v4 Element tone',
  'Palette': 'v4 Palette',
}

/**
 * @typedef {Object} AuditTokenDriftOptions
 * @property {string} [accessToken] - Figma PAT (required unless both datasets are pre-fetched)
 * @property {string} [sourceFileKey] - Source file key (required unless sourceData is provided)
 * @property {string} [sourceBranchKey] - Optional branch key for the source file
 * @property {string} [targetFileKey] - Target file key (required unless targetData is provided)
 * @property {string} [targetBranchKey] - Optional branch key for the target file
 * @property {VariableDataset} [sourceData] - Pre-fetched source dataset (from MCP or saved JSON)
 * @property {VariableDataset} [targetData] - Pre-fetched target dataset (from MCP or saved JSON)
 * @property {Object<string, string>} [collectionMap] - Custom source→target collection name map
 */

/**
 * @typedef {Object} AuditTokenDriftSummary
 * @property {number} totalCollections - Number of mapped collection pairs checked
 * @property {number} matched - Collections whose hashes matched
 * @property {number} drifted - Collections with at least one value drift
 * @property {number} missingSource - Mapped source collections not present in source dataset
 * @property {number} missingTarget - Mapped target collections not present in target dataset
 * @property {number} totalDrifts - Total variable × mode drifts across all collections
 */

/**
 * @typedef {Object} AuditTokenDriftReport
 * @property {string} title
 * @property {AuditTokenDriftSummary} summary
 * @property {CollectionDiff[]} issues
 */

/**
 * Orchestrates a token-drift audit between two Figma files.
 *
 * Typical use: comparing a "source of truth" design file (where tokens are
 * authored with their alias cascade intact) against a library file (where
 * tokens may have been copied and baked, losing aliases or drifting).
 *
 * Runs in three modes:
 *
 * 1. Pre-fetched: both `sourceData` and `targetData` supplied. No API calls.
 * 2. REST: supply `accessToken` + both fileKeys; uses `getLocalVariables`.
 *    Note: the REST API's local-variables endpoint requires Enterprise plan.
 * 3. Mixed: pre-fetched source, REST target (or vice versa).
 *
 * @param {AuditTokenDriftOptions} options
 * @returns {Promise<AuditTokenDriftReport>}
 */
export async function auditTokenDrift(options) {
  const {
    accessToken,
    sourceFileKey,
    sourceBranchKey,
    targetFileKey,
    targetBranchKey,
    sourceData,
    targetData,
    collectionMap = SANITY_V4_COLLECTION_MAP,
  } = options

  let resolvedSource = sourceData
  let resolvedTarget = targetData

  if (!resolvedSource || !resolvedTarget) {
    if (!accessToken) {
      throw new Error(
        'accessToken is required when sourceData or targetData is not pre-fetched',
      )
    }
    const client = createFigmaClient({ accessToken })

    if (!resolvedSource) {
      if (!sourceFileKey) {
        throw new Error('sourceFileKey is required when sourceData is not pre-fetched')
      }
      const effectiveKey = getEffectiveFileKey({
        fileKey: sourceFileKey,
        branchKey: sourceBranchKey,
      })
      resolvedSource = await client.getLocalVariables(effectiveKey)
    }

    if (!resolvedTarget) {
      if (!targetFileKey) {
        throw new Error('targetFileKey is required when targetData is not pre-fetched')
      }
      const effectiveKey = getEffectiveFileKey({
        fileKey: targetFileKey,
        branchKey: targetBranchKey,
      })
      resolvedTarget = await client.getLocalVariables(effectiveKey)
    }
  }

  const sourceSnapshot = buildSnapshot(resolvedSource)
  const targetSnapshot = buildSnapshot(resolvedTarget)
  const issues = diffSnapshots(sourceSnapshot, targetSnapshot, collectionMap)

  /** @type {AuditTokenDriftSummary} */
  const summary = {
    totalCollections: issues.length,
    matched: 0,
    drifted: 0,
    missingSource: 0,
    missingTarget: 0,
    totalDrifts: 0,
  }

  for (const diff of issues) {
    if (diff.status === 'match') summary.matched++
    else if (diff.status === 'drift') {
      summary.drifted++
      summary.totalDrifts += diff.driftCount || 0
    } else if (diff.status === 'missing-source') summary.missingSource++
    else if (diff.status === 'missing-target') summary.missingTarget++
  }

  return {
    title: 'Token Drift Audit',
    summary,
    issues,
  }
}
