# Start Session Rate-Plan Selection Fix

## Problem
On the customer Start Session modal, tapping a different rate plan would
work for a moment, then silently snap back to the first plan — making it
look like you "can't select another rate plan again." Extend Session did
not have this problem.

## Root cause
`StartSessionModal.jsx`'s reseed effect depended on `visibleRatePlans`:

```js
useEffect(() => {
  if (open) {
    const first = visibleRatePlans?.[0]?.id ?? null
    setRatePlanId(first)
    ...
  }
}, [open, visibleRatePlans])
```

`visibleRatePlans` (`eligibleCustomerPlans(ratePlans, tier)`) is recomputed
fresh on every render and is not memoized/stable, so it's a new array
reference nearly every time — including on the background rate-plan
refreshes that happen via socket push / poll while the modal is open. Each
of those refreshes re-triggered the effect and reset `ratePlanId` back to
the first plan, wiping out whatever the customer had just tapped.

`ExtendSessionModal.jsx` already had this exact bug and was already fixed
(its reseed effect intentionally excludes the plans list from its
dependency array — see the comment in that file). The same fix had never
been applied to `StartSessionModal.jsx`.

Admin's own `SessionModal.jsx` never had this problem — its reset effect
only fires when the *currently selected* plan is no longer in the active
list (`!allActiveRatePlans.some(p => p.id === ratePlanId)`), not on every
reference change of the plans array.

## Fix
- `apps/customer/src/components/customer/StartSessionModal.jsx`: the reseed
  effect now depends only on `[open]`, matching the pattern already used in
  `ExtendSessionModal.jsx`. It still reseeds the form correctly whenever the
  modal is freshly opened; it no longer refires on background plan
  refreshes while the modal is already open.
- `apps/customer/dist/assets/index-DVAdHg-z.js` (the bundle the packaged
  Electron customer app actually loads) had the same bug baked into the
  built code and was hand-patched the same way, since `node_modules` are
  not present in this archive to run a real `vite build`. `node --check`
  passed on the patched bundle.

## Extend Session — confirmed already correct
Checked both source (`ExtendSessionModal.jsx`) and the packaged customer
`dist` bundle: both already reseed only on `[open, ratePlan?.id]`, not on
the plans list reference, so rate-plan selection during an extension
already works correctly. No change was needed there.

## Still recommended
As with the earlier admin wallet-modal fix, this is a manual patch of a
minified bundle. Run `npm install && npm run build` in `apps/customer` in
a real dev environment and repackage the installer so the shipped bundle
is generated from source rather than hand-edited.
