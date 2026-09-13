# Aezakmi Cloud — Developer Approval Registration

_Last updated: September 2026_

Aezakmi Cloud is approval-only. A public visitor may submit a business access request, but the browser cannot create a Supabase Auth account or organization.

## Security model

```text
Public visitor
   |
   | Request access (no password, no Auth user)
   v
registration_requests
   |
   | Aezakmi platform developer reviews
   v
Approve & invite
   |
   +--> Supabase Auth invitation
   +--> Organization + owner membership
   +--> Starter subscription
   +--> Main Branch + branch config
   |
   v
Owner opens invitation
   |
   | sets password
   v
registration_requests.status = activated
```

The old authenticated `aezakmi_create_organization()` self-service path is revoked by migration `20260913000004_registration_approval.sql`.

## 1. Apply the approval migration

From the repository root:

```powershell
npx supabase db push --dry-run
npx supabase db push
```

Verify the migration history includes:

```text
20260913000004_registration_approval
```

## 2. Disable public Supabase Auth signup

In Supabase Dashboard:

```text
Authentication
→ Providers / Email (or General configuration)
→ Allow new users to sign up = OFF
```

Keep Email authentication enabled. Existing and invited users can still sign in.

This dashboard setting is required in addition to the application UI. It prevents a user from bypassing the UI by manually calling `/auth/v1/signup`.

## 3. Bootstrap the first Aezakmi platform developer

You need one existing Supabase Auth user to approve businesses. If your developer account already exists, run this in **Supabase SQL Editor** and replace the email:

```sql
insert into public.platform_developers(user_id,email,display_name,is_active)
select id,email,'Aezakmi Developer',true
from auth.users
where lower(email)=lower('YOUR_DEVELOPER_EMAIL@example.com')
on conflict(user_id) do update
set email=excluded.email,
    display_name=excluded.display_name,
    is_active=true;
```

Confirm:

```sql
select user_id,email,display_name,is_active,created_at
from public.platform_developers;
```

Do not add business owners to `platform_developers`.

If no developer Auth user exists yet, create one manually from Supabase Dashboard → Authentication → Users, then run the SQL above. Public signup should remain disabled.

## 4. Configure invitation redirect

Set the Supabase Auth Site URL to the production Vercel Admin URL:

```text
Authentication
→ URL Configuration
→ Site URL = https://YOUR-ADMIN-DOMAIN
```

Add the same production domain under allowed Redirect URLs. Add Preview URLs only when intentionally testing invitations on Vercel Preview deployments.

The application consumes the Supabase invitation token before the React HashRouter initializes, then requires the invited owner to set a password.

Optionally pin the Edge Function invitation redirect explicitly:

```powershell
npx supabase secrets set AEZAKMI_ADMIN_URL=https://YOUR-ADMIN-DOMAIN
```

If `AEZAKMI_ADMIN_URL` is not set, Supabase uses the project Auth Site URL.

## 5. Deploy the Edge Functions

```powershell
npx supabase functions deploy --use-api
npx supabase functions list
```

Approval functions:

```text
request-business-access   public request endpoint; no Auth user creation
developer-registrations   developer-only list/review/approve/reject endpoint
activate-registration     invited owner activation endpoint
```

All Edge Functions remain single-file `index.ts` deployments and require no Docker bundling.

## 6. Developer workflow

Sign in using the developer Auth account.

If the developer has no café organization, Cloud Admin opens the standalone Developer Approvals console automatically. If the developer also belongs to a café organization, use the **Developer** item in the Admin sidebar.

Available states:

```text
pending
reviewing
needs_info
approved      (temporary during invite/provisioning)
invited
activated
rejected
```

**Approve & invite** performs the privileged workflow. The public request endpoint does not have permission to invite users or create organizations.

## 7. Business owner workflow

The owner uses **New business? Request access** from the Cloud Admin login page.

The request form asks for:

- owner name
- business / café name
- email
- phone
- city / province
- expected PC count
- optional notes

No password is collected and no Auth account is created.

After approval, the owner receives a Supabase invitation email. Opening it sends them to the Cloud Admin, where they must set a password. The approved organization and Main Branch already exist and are tied to that invited Auth user.

## 8. Existing accounts

Existing approved organization members continue to sign in normally.

An Auth user with no organization membership and no developer role sees **No approved business workspace**. The UI does not offer organization creation.

## 9. Revoking developer access

To disable a developer without deleting their Auth account:

```sql
update public.platform_developers
set is_active=false
where lower(email)=lower('developer@example.com');
```

RLS and the developer Edge Function both enforce `is_active=true`.
