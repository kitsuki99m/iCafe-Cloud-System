// Mock credential store for the frontend-only auth simulation.
// Once POST /api/auth/login exists (Section 5 of the roadmap), this file goes away
// and AuthContext calls the API instead.

export const ADMIN_USERS = [
  {
    id: 'admin-1',
    name: 'Front Desk Admin',
    username: 'admin',
    password: 'admin123',
    pin: '2468',
  },
]

// pcIp mirrors the ipAddress of the PC each member is currently sitting at in mockFloor.js,
// so "Continue as this PC" and member login both resolve to the same live session.
// This array only seeds AppDataContext's initial state now — once a member is added,
// edited, or removed through the admin Members page, AppDataContext.state.members is
// the live source and this constant is never read again.
export const MEMBERS = [
  { id: 'm1', name: 'Jhon Rey Cabahug', password: 'jhonrey1', tier: 'Regular', wallet: 0, pcIp: '192.168.100.12', pcId: 'pc-2' },
  { id: 'm2', name: 'Maricel Santos', password: 'maricel1', tier: 'VIP', wallet: 240, pcIp: '192.168.100.13', pcId: 'pc-3' },
  { id: 'm3', name: 'Ace Villanueva', password: 'ace12345', tier: 'Gold', wallet: 60, pcIp: '192.168.100.21', pcId: 'pc-7' },
  { id: 'm4', name: 'Renz Dela Cruz', password: 'renz2025', tier: 'Regular', wallet: 0, pcIp: '192.168.100.23', pcId: 'pc-9' },
  { id: 'm5', name: 'Nico Alvarado', password: 'nico2021', tier: 'VIP', wallet: 500, pcIp: '192.168.100.32', pcId: 'pc-14' },
]

// Simulates the client IP this browser would be assigned by CCBoot on a real cafe PC.
// In production this comes from the host app / Express request, not a frontend constant.
export const CURRENT_CLIENT_IP = '192.168.100.21'

// findMemberByIp / findMemberByNameAndPassword now live on AppDataContext, since
// they need to look up the live (admin-editable) member list, not this static seed.

// Random id for admin-created members — mirrors makeRatePlanId/makePcId in
// mockFloor.js since there's no backend yet to hand one out.
export function makeMemberId() {
  return `m-${Math.random().toString(36).slice(2, 8)}`
}
