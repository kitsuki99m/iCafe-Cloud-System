# Production observability

Café Edge records unhandled HTTP/process failures as redacted JSONL under `./data/logs` by default. Passwords, PINs, tokens, cookies, and authorization values are redacted before writing.

Cloud public/pairing/runtime/session-management functions aggregate failures in `system_observability_events` using ten-minute fingerprints so repeated failures do not create high-volume logging traffic.

Useful checks:

- repeated `station-admin` errors: station/session control path
- repeated `pair-station` / `pair-edge` warnings: pairing abuse or configuration issue
- repeated `station-runtime` errors: Customer Station runtime/heartbeat issue
- local `errors-YYYY-MM-DD.jsonl`: Café Edge HTTP/process failures
