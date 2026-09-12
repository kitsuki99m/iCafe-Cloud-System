# Top-Up and Login Security Changes

- GCash top-up requests now ask for the customer's **GCash number**, not a transaction reference number.
- The existing SQLite `ref_no` column is retained for backward-compatible storage, but the API/frontend expose it as `gcashNumber` for top-up requests.
- Both authenticated and zero-balance/public top-up requests use the top-up rate limiter: **5 requests per 10 minutes per client IP**.
- Login is rate limited to **10 attempts per 15 minutes per client IP**.
- New top-up requests emit Socket.IO `topup:new_request`.
- The Admin notification center plays **two ping tones** at full Web Audio source gain (`1.0`) when a new request arrives. Actual loudness remains subject to the Windows/system volume and audio-device settings.
- Existing `data:changed` synchronization remains in place.
