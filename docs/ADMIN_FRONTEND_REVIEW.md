# Aezakmi Cafe — Admin Frontend Bug-Fix Review

_Last reviewed: Aug 11, 2026_

## Fixed in this pass

### 1. Add PC was broken
`makePcId()` only returned `pc.id`, so a new PC draft had no ID and the Add PC modal always failed with `Enter a valid PC label.`.

Fixed by generating the same stable `pc-<label>` identifier format used by the backend.

### 2. Add/Edit PC validation was too dependent on backend errors
Added frontend validation for:
- IPv4 format
- configured IP prefix
- duplicate IP address
- duplicate generated PC ID for new PCs

Backend validation remains authoritative.

### 3. Logs displayed the wrong entity field
The backend returns `entityType`, while the Admin Logs page rendered `entity_type`.

Fixed with canonical `entityType` support plus a legacy fallback.

### 4. Inactive rate plans could appear in session-start UI
Admin receives active and inactive rate plans. The Floor Matrix session UI could therefore offer inactive plans that the backend would reject.

Fixed by filtering inactive plans from session-start and member-session-top-up selection.

### 5. Rate-plan data normalization
Admin AppData now normalizes rate-plan IDs and active/self-service flags at the context boundary so React components use one consistent representation.

### 6. PC/session data normalization
PC IDs, IP addresses, session IDs, customer IDs, and rate-plan IDs are normalized at the Admin context boundary.

### 7. Floor actions silently swallowed backend errors
Start session, end session, and maintenance operations now surface backend errors in the Floor Matrix instead of failing silently.

### 8. Member actions silently swallowed backend errors
Add/edit/delete member, wallet editing, and session-time top-up failures now surface an actionable error message.

## Validation performed

- Backend JavaScript files: `node --check` passed.
- Admin JavaScript utility files: `node --check` passed.
- Source-level review performed across Admin pages, components, context, API/socket helpers, and corresponding backend API contracts.

## Build limitation

The ZIP intentionally contains no `node_modules`. A local Admin build could not be executed in this review environment because Vite dependencies were not installed. The production Windows build machine must run dependency installation and then:

```text
npm run build:all
```

followed by the live Admin acceptance tests.
