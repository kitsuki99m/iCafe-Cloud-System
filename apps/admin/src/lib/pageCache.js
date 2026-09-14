import { cloudBranchId, isCloudAdmin } from './cloudClient.js'

export function scopedPageCacheKey(namespace, user, variant = '') {
  if (!user || !namespace) return null
  const scope = isCloudAdmin()
    ? `cloud:${user.id}:${cloudBranchId() || 'unselected'}`
    : `local:${user.id}:${user.role || 'user'}`
  return [`page`, namespace, scope, variant].filter(Boolean).join(':')
}

export function userCacheKey(namespace, user, variant = '') {
  if (!user || !namespace) return null
  return [`page`, namespace, `user:${user.id}`, variant].filter(Boolean).join(':')
}
