import { createOperationKey } from './api.js'

export async function runBulkMutation(ids, mutate, operationKey = createOperationKey()) {
  const targets = [...new Set((ids || []).map((value) => String(value)))]
  const results = await Promise.allSettled(targets.map((targetId) => mutate(targetId, `${operationKey}:${targetId}`)))
  const succeededIds = []
  const failed = []
  results.forEach((result, index) => {
    const targetId = targets[index]
    if (result.status === 'fulfilled') succeededIds.push(targetId)
    else failed.push({ id:targetId, error:result.reason })
  })
  if (failed.length) {
    const error = new Error(`${failed.length} of ${targets.length} operation${targets.length===1?'':'s'} failed. Retry will safely reuse the same operation keys.`)
    error.code = 'BULK_MUTATION_PARTIAL_FAILURE'
    error.operationKey = operationKey
    error.succeededIds = succeededIds
    error.failed = failed
    throw error
  }
  return { operationKey, succeededIds, failed:[] }
}
