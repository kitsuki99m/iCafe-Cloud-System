import { useCallback, useRef } from 'react'

/**
 * useOptimisticAction
 *
 * Centralises the optimistic-update → server-dispatch → reconcile / rollback
 * lifecycle so action functions in AppDataContext (and any component-level
 * mutations) don't repeat the same snapshot-and-revert boilerplate.
 *
 * Usage
 * -----
 *   const execute = useOptimisticAction(setState, refresh, {
 *     optimistic: (current) => ({ ...current, topUpRequests: [...] }),
 *     action:     () => apiPatch(`/top-ups/${id}/approve`),
 *     onSuccess:  (result) => { playAdminSound('success'); showToast({ title: 'Top up approved' }) },
 *     onError:    (error)  => { showToast({ title: 'Action failed', message: error.message, tone: 'warning' }) },
 *   })
 *   await execute()
 *
 * Guarantees
 * ----------
 *  - The optimistic mutation is always memory-only (no IndexedDB write).
 *  - Rollback is achieved by calling refresh(), which overwrites optimistic
 *    state with the last confirmed server snapshot.
 *  - Rapid successive calls are coalesced: only the latest in-flight token is
 *    honoured; stale resolutions are silently dropped.
 *  - The returned promise rejects with the server error so callers can catch it.
 *
 * @param {Function} setState   - React setState dispatcher (from AppDataContext or local state)
 * @param {Function} refresh    - Async function that re-fetches authoritative server state
 * @param {object}   options
 *   @param {Function} options.optimistic - (currentState) => nextState  — applied immediately
 *   @param {Function} options.action     - () => Promise<result>        — silent server call
 *   @param {Function} [options.onSuccess]- (result) => void             — called on server OK
 *   @param {Function} [options.onError]  - (error) => void              — called on server error
 */
export function useOptimisticAction(setState, refresh, options = {}) {
  const inflightTokenRef = useRef(null)

  const execute = useCallback(async (...args) => {
    // 1. Apply the optimistic state mutation immediately (memory-only).
    if (options.optimistic) {
      setState((current) => options.optimistic(current, ...args))
    }

    // 2. Supersede any previous in-flight call for the same action so a rapid
    //    double-click never commits two mutations or triggers two rollbacks.
    const token = { cancelled: false }
    if (inflightTokenRef.current) inflightTokenRef.current.cancelled = true
    inflightTokenRef.current = token

    try {
      const result = await options.action(...args)

      // Drop stale resolutions if a newer call superseded this one.
      if (token.cancelled) return undefined

      options.onSuccess?.(result)

      // Authoritative reconciliation: overwrites the optimistic state with the
      // server-confirmed snapshot.  We do NOT await this so the success
      // callback and toast appear instantly.
      refresh().catch(() => {})

      return result
    } catch (error) {
      if (token.cancelled) return undefined

      // Rollback by re-fetching the last known-good snapshot from the server.
      // This replaces the optimistic state with authoritative truth.
      refresh().catch(() => {})

      options.onError?.(error)

      // Re-throw so the caller (e.g. a modal) can handle the error locally.
      throw error
    }
  }, [setState, refresh, options])

  return execute
}
