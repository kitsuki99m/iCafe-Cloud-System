# Customer Station Master PIN Emergency Controls

Customer Station hidden emergency shortcuts now use the Station Setup Master PIN instead of the Admin management/login PIN:

- `Alt+Shift+W` — Quit Customer Station
- `Alt+Shift+L` — Lock Customer Station
- `Alt+Shift+U` — Unlock Customer Station

## Lifecycle behavior

The installed Electron process verifies the master PIN locally first. For a paired station, Café Edge verifies the same master PIN again before creating the station-control authorization so session lifecycle remains authoritative:

- Lock checkpoints/pauses the active session before the window is locked.
- Unlock resumes the session only after the Customer Station ACK succeeds.
- Quit checkpoints/releases the station session, revokes station auth, and marks the PC offline before Electron exits.
- An unpaired/not-yet-registered Customer Station keeps an offline recovery path after successful local master-PIN verification.

Admin user PINs are no longer accepted by the Quit/Lock/Unlock Customer Station shortcut modal.

## Configuration

The default master PIN remains `062321` for compatibility with the existing Customer Station setup gate. To override it, set the same value on Café Edge and the Customer Station process/build environment:

```env
AEZAKMI_STATION_SETUP_MASTER_PIN=YOUR_4_TO_8_DIGIT_PIN
```

If you customize the value, Café Edge and Customer Station must match or paired emergency controls will be rejected after local verification.
