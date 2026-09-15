import 'dotenv/config'

function bool(value, fallback = false) {
  if (value == null) return fallback
  return String(value).toLowerCase() === 'true'
}

const nodeEnv = process.env.NODE_ENV ?? 'production'
const isDevelopment = nodeEnv === 'development'

export const env = {
  nodeEnv,
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
  databasePath: process.env.DATABASE_PATH ?? './data/aezakmi.sqlite',
  jwtSecret: process.env.JWT_SECRET ?? (isDevelopment ? 'development-only-change-me' : ''),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  sessionIdleMinutes: Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES ?? 10),
  heartbeatSeconds: Number(process.env.SESSION_HEARTBEAT_SECONDS ?? 10),
  corsOrigin: process.env.CORS_ORIGIN ?? (isDevelopment ? '*' : ''),
  disklessProvider: process.env.DISKLESS_PROVIDER ?? 'icafe8',
  serverName: process.env.SERVER_NAME ?? 'Aezakmi Cafe Server',
  trustProxy: bool(process.env.TRUST_PROXY),
  allowUnregisteredDevStation: bool(process.env.AEZAKMI_ALLOW_UNREGISTERED_DEV_STATION) && nodeEnv !== 'production',
  embeddedCustomerServer: bool(process.env.AEZAKMI_EMBEDDED_CUSTOMER_SERVER),
  cloudEnabled: bool(process.env.AEZAKMI_CLOUD_ENABLED),
  supabaseUrl: String(process.env.AEZAKMI_SUPABASE_URL ?? '').trim().replace(/\/+$/, ''),
  supabasePublishableKey: String(process.env.AEZAKMI_SUPABASE_PUBLISHABLE_KEY ?? '').trim(),
  cloudSyncIntervalSeconds: Number(process.env.AEZAKMI_CLOUD_SYNC_INTERVAL_SECONDS ?? 60),
  cloudSyncBatchSize: Number(process.env.AEZAKMI_CLOUD_SYNC_BATCH_SIZE ?? 100),
  cloudRequestTimeoutMs: Number(process.env.AEZAKMI_CLOUD_REQUEST_TIMEOUT_MS ?? 8000),
  edgeVersion: process.env.AEZAKMI_EDGE_VERSION ?? '1.0.0',
  // Shared operator/developer master PIN used by the installed Customer Station
  // for protected local station controls. Keep this value identical on Café
  // Edge and Customer Station when overriding the built-in default.
  stationSetupMasterPin: String(process.env.AEZAKMI_STATION_SETUP_MASTER_PIN ?? '062321').trim(),
}

if (!Number.isFinite(env.port) || env.port < 1 || env.port > 65535) {
  throw new Error('PORT must be a valid TCP port.')
}
if (!Number.isFinite(env.sessionIdleMinutes) || env.sessionIdleMinutes < 1) {
  throw new Error('SESSION_IDLE_TIMEOUT_MINUTES must be at least 1.')
}
if (!Number.isFinite(env.cloudSyncIntervalSeconds) || env.cloudSyncIntervalSeconds < 2) {
  throw new Error('AEZAKMI_CLOUD_SYNC_INTERVAL_SECONDS must be at least 2.')
}
if (!Number.isFinite(env.cloudSyncBatchSize) || env.cloudSyncBatchSize < 1 || env.cloudSyncBatchSize > 200) {
  throw new Error('AEZAKMI_CLOUD_SYNC_BATCH_SIZE must be between 1 and 200.')
}
if (!Number.isFinite(env.cloudRequestTimeoutMs) || env.cloudRequestTimeoutMs < 1000) {
  throw new Error('AEZAKMI_CLOUD_REQUEST_TIMEOUT_MS must be at least 1000.')
}
if (env.cloudEnabled && !/^https:\/\/[^/]+\.supabase\.co$/i.test(env.supabaseUrl)) {
  throw new Error('AEZAKMI_SUPABASE_URL must be a Supabase project URL when cloud integration is enabled.')
}
if (env.cloudEnabled && !env.supabasePublishableKey.startsWith('sb_publishable_')) {
  throw new Error('AEZAKMI_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key when cloud integration is enabled.')
}
if (!/^\d{4,8}$/.test(env.stationSetupMasterPin)) {
  throw new Error('AEZAKMI_STATION_SETUP_MASTER_PIN must contain 4 to 8 digits.')
}
if (!isDevelopment) {
  if (env.jwtSecret === 'development-only-change-me' || env.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be a strong secret of at least 32 characters outside development.')
  }
  if (!env.corsOrigin || env.corsOrigin === '*') {
    throw new Error('CORS_ORIGIN must explicitly list the allowed application origins outside development.')
  }
}
