# Brevo for invitations and quotations

Aezakmi Cafe Management sends Developer Console quotation, owner invitation, activation/resend, and email-check messages through Brevo transactional email. Supabase Auth still generates the signed invitation/recovery links.

## Supabase secrets

Keep the API key server-side only:

```powershell
npx supabase secrets set BREVO_API_KEY="YOUR_BREVO_API_KEY"
npx supabase secrets set BREVO_SENDER_EMAIL="kyle.serina05@gmail.com"
npx supabase secrets set BREVO_SENDER_NAME="Aezakmi Cafe Management"
npx supabase secrets set AEZAKMI_REPLY_TO="kyle.serina05@gmail.com"
npx supabase secrets set AEZAKMI_ADMIN_URL="https://icafe-aezakmi.vercel.app"
```

`BREVO_SENDER_EMAIL` must be registered and verified in Brevo. The app sends to the actual business-owner email stored on the registration request; it does not redirect production messages to the developer address.

After changing secrets, deploy:

```powershell
npx supabase functions deploy developer-registrations --use-api
```

The function uses `POST https://api.brevo.com/v3/smtp/email` with inline HTML, so the existing Aezakmi-branded quotation and activation email layouts are preserved.
