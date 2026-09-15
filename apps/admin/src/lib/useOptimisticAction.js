import { useRef, useCallback } from 'react'
import { createOperationKey } from './api.js'
import { showToast } from './toast.js'

/**
 * Generic optimistic-mutation primitive used to make admin actions feel
 * instant without waiting on the REST round trip.
 *
 * - `apply(current, operationKey)` mutates state synchronously (0ms
 *   perceived latency) before any network call is made.
 * - Calls are serialized per `queueKey` (e.g. `session:${sessionId}`) so a
 *   double-click on "+1 Hour" can't fire two overlapping mutations for the
 *   same target — the second call waits for the first's REST round trip.
 * - On REST failure/timeout, `rollback(current, operationKey)` is applied
 *   and an error toast is shown. Rollback is an explicit inverse patch, not
 *   a snapshot revert: a `session:updated` socket event can legitimately
 *   land on the same entity between the click and the rejection (e.g. from
 *   another admin), and a full snapshot revert would stomp that newer data.
 * - `reconcile(current, serverResult, operationKey)` merges the
 *   authoritative server response once it arrives. In this app the
 *   corresponding socket event usually arrives first (it doesn't wait on
 *   this REST response) and reconciles state via the normal socket handler
 *   using the same operationKey — both paths converge because the wire
 *   format uses absolute values, never deltas.
 */
export function useOptimisticAction(setState) {
  const queues = useRef(new Map()) // queueKey -> Promise chain

  const run = useCallback(({
    queueKey,
    apply,
    rollback,
    request,
    reconcile,
    errorMessage = 'Action failed — reverted.',
  }) => {
    const operationKey = createOperationKey()
    const prevChain = queues.current.get(queueKey) || Promise.resolve()

    const task = prevChain
      .catch(() => {}) // a prior failure must not poison the queue for the next action
      .then(async () => {
        setState((current) => apply(current, operationKey))
        try {
          const result = await request(operationKey)
          if (reconcile) setState((current) => reconcile(current, result, operationKey))
          return result
        } catch (err) {
          setState((current) => rollback(current, operationKey))
          showToast({ title: 'Action failed', message: errorMessage, tone: 'error' })
          throw err
        }
      })

    queues.current.set(queueKey, task)
    return task
  }, [setState])

  return run
}
