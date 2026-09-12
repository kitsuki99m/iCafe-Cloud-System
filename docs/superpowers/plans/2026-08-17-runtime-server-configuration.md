# Runtime Server Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Admin and Customer Electron apps to change the backend host/port at runtime without rebuilding while preserving all existing REST/Socket.IO contracts and development fallbacks.

**Architecture:** Electron main owns a small `server-config.json` in each app's `userData` directory and validates writes. Preload exposes trusted get/save operations. Renderer API/socket helpers read the resolved runtime configuration synchronously so existing API call signatures remain unchanged; saving reloads the renderer so Socket.IO is recreated against the new origin.

**Tech Stack:** Electron 39, React 19, Vite 8, Socket.IO client 4, Node.js built-ins.

## Global Constraints

- Preserve current backend endpoints and payload contracts.
- Preserve browser/Vite development proxy behavior.
- Preserve packaged Admin local-backend default (`127.0.0.1:3000`).
- Customer packaged builds must no longer require `VITE_API_BASE_URL` at build time.
- A saved runtime server configuration takes precedence over `VITE_API_BASE_URL`.
- Test Connection must exercise `/api/health` from the renderer so CORS/network behavior matches real requests.
- No unrelated UI redesign.

---

### Task 1: Regression guards
**Files:** Create `tools/runtime-server-config-regressions.test.mjs`; modify legacy runtime assertion in `tools/runtime-regressions.test.mjs`.
- [ ] Add assertions for trusted persistence IPC, userData storage, runtime precedence, Socket.IO origin derivation, connection UI, and Vite build decoupling.
- [ ] Run focused tests and confirm RED.

### Task 2: Electron runtime persistence
**Files:** Modify both `electron/main.cjs` and both `electron/preload.cjs` files.
- [ ] Add validated host/port read/write using `server-config.json` under `app.getPath('userData')`.
- [ ] Add trusted synchronous read and async save IPC.
- [ ] Preserve Admin localhost default and Customer unset state.

### Task 3: Renderer URL resolution
**Files:** Create `src/lib/serverConfig.js` in both apps; modify both `src/lib/api.js`, both `src/lib/socket.js`, and Customer `vite.config.js`.
- [ ] Runtime config overrides build-time env.
- [ ] Vite/browser development keeps `/api` proxy fallback.
- [ ] Packaged Customer without saved/env config returns a clear configuration-required error.
- [ ] Socket origin derives from the same API base.

### Task 4: Connection settings UI
**Files:** Create `components/common/ServerConnectionModal.jsx` in both apps; modify Admin and Customer login forms.
- [ ] Host + port fields, Test Connection, Save, current source/status.
- [ ] Save persists then reloads renderer.
- [ ] Test calls candidate `/api/health` directly from renderer.

### Task 5: Verification and packaging
- [ ] Run full regression suite.
- [ ] Parse all renderer JS/JSX and verify relative imports.
- [ ] Run `node --check` for backend/Electron/build JS/CJS/MJS.
- [ ] Package full source ZIP, re-extract it, and repeat verification on the exact archive.
