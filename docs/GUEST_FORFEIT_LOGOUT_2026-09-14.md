# Guest Prepaid Forfeit Logout — 2026-09-14

Customer Guest prepaid logout is now an explicit destructive action when paid time remains.

## Behavior

- Guest + active prepaid session + remaining time > 0: pressing **Log Out** opens a confirmation modal.
- The modal shows the current remaining time and warns that logout will permanently forfeit it.
- **Keep Session** closes the modal without changing session state.
- **Forfeit & Log Out** calls the authoritative Guest end-session endpoint with `disposition: "forfeit"`.
- The server ends the session and zeros any saved/recoverable Guest remaining time before Customer clears Guest identity and returns to the login kiosk.
- If the authoritative end-session call fails, Customer remains in Guest mode and reports that remaining time was not forfeited.
- Member logout behavior is unchanged.

Both Café Edge and Cloud station APIs already support the Guest-only `forfeit` disposition; this patch wires the Customer UI to that existing contract.
