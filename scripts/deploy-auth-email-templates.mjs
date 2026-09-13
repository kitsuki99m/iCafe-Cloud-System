import fs from 'node:fs/promises'

const accessToken = process.env.SUPABASE_ACCESS_TOKEN || ''
const configuredRef = process.env.SUPABASE_PROJECT_REF || ''
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const projectRef = configuredRef || (() => {
  try { return new URL(supabaseUrl).hostname.split('.')[0] || '' } catch { return '' }
})()

if (!accessToken || !projectRef) {
  console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF (or SUPABASE_URL) before deploying hosted Auth templates.')
  process.exit(1)
}

const [invite, recovery] = await Promise.all([
  fs.readFile(new URL('../supabase/templates/invite.html', import.meta.url), 'utf8'),
  fs.readFile(new URL('../supabase/templates/recovery.html', import.meta.url), 'utf8'),
])

const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    smtp_sender_name: 'Aezakmi Café',
    mailer_subjects_invite: 'Your Aezakmi Café business workspace is ready',
    mailer_templates_invite_content: invite,
    mailer_subjects_recovery: 'Continue setting up your Aezakmi Café owner account',
    mailer_templates_recovery_content: recovery,
  }),
})

if (!response.ok) {
  const body = await response.text()
  console.error(`Unable to update Supabase Auth templates (${response.status}): ${body}`)
  process.exit(1)
}

console.log(`Aezakmi Auth email templates deployed to Supabase project ${projectRef}.`)
