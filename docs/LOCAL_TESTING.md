# Local Testing

## Clean Test Data
The seed creates no demo members, PCs, computer clients, or customer sessions. Register the laptop as a PC from the Admin app before testing customer operations.

## Admin Session Behavior

Admin accounts allow only one active backend session. Explicit logout revokes the current session. If an older session is still active because the Electron app crashed or closed unexpectedly, the next successful login revokes that old session and creates the new session instead of returning `409 ACCOUNT_ALREADY_ACTIVE`.
