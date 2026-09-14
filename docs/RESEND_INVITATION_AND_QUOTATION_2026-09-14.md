# Resend integration retired

The application no longer uses Resend for Developer Console email delivery. Quotations, invitations, activation-link resends, and email checks use Brevo. See `BREVO_INVITATION_AND_QUOTATION_2026-09-15.md`.

Remove/ignore old `RESEND_API_KEY` and `AEZAKMI_EMAIL_FROM` configuration. The active secrets are `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, optional `AEZAKMI_REPLY_TO`, and `AEZAKMI_ADMIN_URL`.
