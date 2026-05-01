/**
 * Generates the Plugin API script that executes a token import plan inside
 * Figma. The orchestrator passes the plan in via a `__plan` global; the
 * script runs `figma.variables.*` calls and returns a result object.
 *
 * Use via `use_figma` MCP. The returned string is meant to be executed
 * verbatim — do not template values into it directly; pass them as `__plan`.
 *
 * @param {object} options
 * @param {boolean} [options.dryRun=false]  If true, log operations without writing.
 * @param {boolean} [options.prune=false]   If true, delete variables in mapped
 *                                          collections that don't appear in the plan.
 * @param {string[]} [options.declaredVarNames=[]]  Slash-form variable names that
 *                                                  the plan declared. Used for prune.
 * @returns {string} JS source to execute via use_figma
 */
export function getImportScript({ dryRun = false, prune = false, declaredVarNames = [] } = {}) {
  return `
(async () => {
  const plan = __plan
  const dryRun = ${JSON.stringify(dryRun)}
  const prune = ${JSON.stringify(prune)}
  const declaredVarNames = new Set(${JSON.stringify(declaredVarNames)})

  const report = {
    created: [],
    updated: [],
    unchanged: [],
    pruned: [],
    skipped: plan.skipped ?? [],
    errors: plan.errors ?? [],
    log: [],
  }

  if (report.errors.length > 0) {
    report.log.push('Aborting: fatal errors in plan')
    return report
  }

  // Collection + mode setup.
  const collectionsByName = new Map()
  for (const c of figma.variables.getLocalVariableCollections()) {
    collectionsByName.set(c.name, c)
  }

  const required = new Map()
  for (const op of plan.operations) {
    if (!op.collectionName) continue
    if (!required.has(op.collectionName)) required.set(op.collectionName, new Set())
    if (op.modeName) required.get(op.collectionName).add(op.modeName)
  }

  for (const [name, modeSet] of required.entries()) {
    let collection = collectionsByName.get(name)
    if (!collection) {
      if (dryRun) {
        report.log.push('[dry-run] would create collection: ' + name)
        continue
      }
      collection = figma.variables.createVariableCollection(name)
      collectionsByName.set(name, collection)
      report.log.push('Created collection: ' + name)
    }
    const existingModeNames = new Set(collection.modes.map((m) => m.name))
    let firstModeRenamed = false
    for (const modeName of modeSet) {
      if (existingModeNames.has(modeName)) continue
      if (!firstModeRenamed && collection.modes.length === 1 && collection.modes[0].name === 'Mode 1') {
        if (!dryRun) collection.renameMode(collection.modes[0].modeId, modeName)
        report.log.push('Renamed default mode to: ' + modeName + ' in ' + name)
        firstModeRenamed = true
      } else {
        if (dryRun) {
          report.log.push('[dry-run] would add mode: ' + modeName + ' to ' + name)
        } else {
          collection.addMode(modeName)
          report.log.push('Added mode: ' + modeName + ' to ' + name)
        }
      }
    }
  }

  function findModeId(collection, modeName) {
    const mode = collection.modes.find((m) => m.name === modeName)
    return mode ? mode.modeId : null
  }

  // Variable operations.
  const varsByName = new Map()
  for (const v of figma.variables.getLocalVariables()) {
    varsByName.set(v.name, v)
  }

  for (const op of plan.operations) {
    try {
      if (op.kind === 'create-variable') {
        if (varsByName.has(op.name)) continue
        if (dryRun) {
          report.log.push('[dry-run] would create variable: ' + op.name)
          report.created.push(op.name)
          continue
        }
        const collection = collectionsByName.get(op.collectionName)
        if (!collection) {
          report.errors.push({ code: 'missing-collection', message: 'Collection not found: ' + op.collectionName })
          continue
        }
        const v = figma.variables.createVariable(op.name, collection.id, op.figmaType)
        if (op.description) v.description = op.description
        varsByName.set(op.name, v)
        report.created.push(op.name)

      } else if (op.kind === 'set-value') {
        const v = varsByName.get(op.name)
        if (!v) {
          report.errors.push({ code: 'missing-variable', message: 'Cannot set value, variable missing: ' + op.name })
          continue
        }
        const collection = collectionsByName.get(op.collectionName)
        const modeId = findModeId(collection, op.modeName)
        if (!modeId) {
          report.errors.push({ code: 'missing-mode', message: 'Mode "' + op.modeName + '" not found in "' + op.collectionName + '"' })
          continue
        }
        const currentValue = v.valuesByMode[modeId]
        if (deepEqual(currentValue, op.value)) {
          report.unchanged.push(op.name + ' [' + op.modeName + ']')
          continue
        }
        if (dryRun) {
          report.log.push('[dry-run] would set ' + op.name + ' [' + op.modeName + ']')
          report.updated.push(op.name + ' [' + op.modeName + ']')
          continue
        }
        v.setValueForMode(modeId, op.value)
        report.updated.push(op.name + ' [' + op.modeName + ']')

      } else if (op.kind === 'set-alias') {
        const v = varsByName.get(op.name)
        if (!v) {
          report.errors.push({ code: 'missing-variable', message: 'Cannot set alias, variable missing: ' + op.name })
          continue
        }
        const target = varsByName.get(op.targetName)
        if (!target) {
          report.errors.push({
            code: 'missing-alias-target',
            message: 'Alias target not found: ' + op.targetName + ' (referenced by ' + op.name + ')',
          })
          continue
        }
        const collection = collectionsByName.get(op.collectionName)
        const modeId = findModeId(collection, op.modeName)
        if (!modeId) {
          report.errors.push({ code: 'missing-mode', message: 'Mode "' + op.modeName + '" not found in "' + op.collectionName + '"' })
          continue
        }
        const aliasRef = figma.variables.createVariableAlias(target)
        const currentValue = v.valuesByMode[modeId]
        if (currentValue && currentValue.type === 'VARIABLE_ALIAS' && currentValue.id === target.id) {
          report.unchanged.push(op.name + ' [' + op.modeName + '] (alias)')
          continue
        }
        if (dryRun) {
          report.log.push('[dry-run] would alias ' + op.name + ' [' + op.modeName + '] -> ' + op.targetName)
          report.updated.push(op.name + ' [' + op.modeName + '] (alias)')
          continue
        }
        v.setValueForMode(modeId, aliasRef)
        report.updated.push(op.name + ' [' + op.modeName + '] (alias)')
      }
    } catch (err) {
      report.errors.push({ code: 'op-failed', message: String(err && err.message || err), op: op.kind + ':' + op.name })
    }
  }

  // Prune.
  if (prune) {
    const mappedCollections = new Set(required.keys())
    for (const v of figma.variables.getLocalVariables()) {
      const collection = figma.variables.getVariableCollectionById(v.variableCollectionId)
      if (!collection || !mappedCollections.has(collection.name)) continue
      if (declaredVarNames.has(v.name)) continue
      if (dryRun) {
        report.log.push('[dry-run] would prune: ' + v.name)
        report.pruned.push(v.name)
        continue
      }
      v.remove()
      report.pruned.push(v.name)
    }
  }

  return report

  function deepEqual(a, b) {
    if (a === b) return true
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
    if (a.type === 'VARIABLE_ALIAS' || b.type === 'VARIABLE_ALIAS') {
      return a.type === b.type && a.id === b.id
    }
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    for (const k of keys) {
      if (Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > 1e-9) return false
    }
    return true
  }
})()
`
}
