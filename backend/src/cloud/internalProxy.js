import crypto from 'node:crypto'

// Process-local capability used only for loopback requests created by the bundled
// Edge command executor. It is never exposed to renderers, Supabase, or disk.
export const internalCloudProxySecret = crypto.randomBytes(32).toString('base64url')
