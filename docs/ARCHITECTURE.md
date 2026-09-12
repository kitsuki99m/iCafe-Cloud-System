# Aezakmi Architecture

## Production layout

```text
                    +----------------------+
                    | Vercel Admin (web)   |
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | Supabase             |
                    | Auth / Postgres/RLS  |
                    | Edge Functions       |
                    | Realtime             |
                    +----------+-----------+
                               |
                        outbound HTTPS/WSS
                               |
                               v
+----------------------------------------------------------------+
| Café LAN                                                        |
|                                                                 |
| +-------------------------+                                     |
| | Aezakmi Edge            |                                     |
| | Node/Express/Socket.IO  |                                     |
| | SQLite                  |                                     |
| +------------+------------+                                     |
|              |                                                  |
|       +------+-------+------------------+                        |
|       |              |                  |                        |
|       v              v                  v                        |
| Customer PC      Customer PC     Emergency Admin Electron       |
| Electron         Electron         (same apps/admin local mode)   |
+----------------------------------------------------------------+
```

## Design rules

1. The Edge/SQLite database is the live branch authority.
2. Customer Stations talk only to the Edge.
3. Vercel Admin talks to Supabase, not private `192.168.x.x` addresses.
4. Supabase authorizes tenant access; the Edge executes café mutations through existing business rules.
5. Cloud commands and sync events are durable and idempotent.
6. Realtime accelerates delivery but periodic sync provides correctness.
7. Password/PIN/station-token hashes never enter the cloud mirror.
8. Cloud outages do not terminate local sessions or disable Emergency Admin.
