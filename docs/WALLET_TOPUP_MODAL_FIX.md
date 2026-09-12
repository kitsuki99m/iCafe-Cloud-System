# Wallet Top-Up Modal Fix

## Problem
`apps/admin/src` (source) already had the individual "Top up wallet" action
wired to its own dedicated `WalletTopUpModal` (blank additive amount field,
"Top Up Wallet" title, calls `adminTopUp`) separate from the pencil-icon
`WalletEditModal` ("Edit Wallet Balance", prefilled with the current
balance, calls `setMemberWallet`).

`apps/admin/dist` — the packaged bundle Electron actually loads — was
stale. It predated that split and reused a single modal component for both
actions, distinguished only by an internal `_quickTopUp` flag spread onto
the member object when the Wallet icon was clicked. That shared-component
approach is what was shipping in the installed app.

## Fix
Hand-patched `apps/admin/dist/assets/index-D2PudpMQ.js` (the source
`node_modules` needed to run a real `vite build` were not present in this
archive, so this was a targeted patch of the built bundle rather than a
fresh build) to match the source behavior exactly:

- Added a dedicated `Qtu_`/`setQtu_` state pair, independent from the
  Edit Wallet Balance state (`S`/`C`).
- The Wallet icon ("Top up wallet") button now calls `setQtu_(member)`
  instead of spreading a `_quickTopUp` flag into the shared edit state.
- Added a standalone `Wtu_` component (mirrors source's
  `WalletTopUpModal`): shows current balance, a blank additive amount
  field, title "Top Up Wallet", and calls `adminTopUp` on confirm.
- The pencil-icon Edit Wallet Balance modal (`V_`) is untouched and no
  longer ever receives the `_quickTopUp` flag, so it always behaves as a
  plain balance override, exactly like source's `WalletEditModal`.

## Validation performed
- `node --check` passed on the patched bundle.
- Confirmed by occurrence count that every new identifier
  (`Qtu_`, `setQtu_`, `Wtu_`) appears exactly where intended, with no
  collisions against existing minified names.
- Confirmed the old `_quickTopUp:!0` flag-setting spread no longer exists
  anywhere in the bundle (the button no longer sets it).

## Still recommended
This is a manual patch of a minified bundle, applied because no
`node_modules`/network access was available in this environment to run a
real build. Run `npm install && npm run build` in `apps/admin` in a real
dev environment and repackage the installer as soon as practical, so the
shipped bundle is generated from source rather than hand-edited.
