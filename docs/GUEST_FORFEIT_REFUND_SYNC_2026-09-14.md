# Guest Forfeit / Refund Station Synchronization

Admin destructive Guest session actions now use a two-phase close. The session is frozen through the existing station-command transport, Customer Station clears its lifecycle marker and returns the Guest UI to the login kiosk, then acknowledges the command. Admin waits for that acknowledgement before committing `/sessions/:id/end` with `forfeit` or `/sessions/:id/refund`.

This prevents Customer Station logout/lifecycle persistence from racing Admin forfeit/refund accounting. Refund and forfeit controls are also mutually exclusive while either action is in flight. If the station never acknowledges, Admin reports an error and does not commit the destructive action. Offline stations skip the renderer handshake because there is no active kiosk renderer to race; interrupted-session persistence remains authoritative.
