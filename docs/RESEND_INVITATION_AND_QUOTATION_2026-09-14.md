# Resend for invitations and quotations

The Developer Console now uses one transactional delivery path for:

- branded quotations,
- first-time Business Owner invitation links, and
- invitation/activation resends.

Supabase Auth still generates signed invitation/recovery links. The application does **not** store the Resend key in source code. `developer-registrations` reads it only from Supabase Edge Function secrets.

## Production secrets

```powershell
npx supabase secrets set RESEND_API_KEY="YOUR_ROTATED_RESEND_KEY"
npx supabase secrets set AEZAKMI_EMAIL_FROM="Aezakmi Café <hello@YOUR_VERIFIED_DOMAIN>"
npx supabase secrets set AEZAKMI_REPLY_TO="YOUR_REPLY_ADDRESS"
npx supabase secrets set AEZAKMI_ADMIN_URL="https://YOUR_ADMIN_DOMAIN"
```

`AEZAKMI_REPLY_TO` is optional. `AEZAKMI_EMAIL_FROM` must be a Resend-verified sender/domain for production delivery.

Then deploy:

```powershell
npx supabase functions deploy developer-registrations --use-api
```

No database migration is required for this email-provider change.

## Retry behavior

For a first invitation, the function asks Supabase Auth to create the invited user and signed invite link, then sends that link through Resend. If Resend rejects the message, the provisional Auth user is removed so approving again is safe. For an outstanding invitation, the function generates a fresh activation link and sends it through Resend.
