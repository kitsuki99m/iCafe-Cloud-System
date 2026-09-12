# Aezakmi Cafe Backend

Local LAN backend for Aezakmi Cafe.

## Stack

- Node.js
- Express
- SQLite (`better-sqlite3`)
- JWT
- Argon2
- CORS
- Helmet
- Rate limiting

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm run seed
npm run dev
```

For the production/local cafe process:

```powershell
npm install
npm run seed
npm start
```

No `node_modules` is committed or included.

## iCafe8 / LAN

The backend must be reachable by every diskless client.

Example `.env`:

```env
HOST=0.0.0.0
PORT=3000
IP_PREFIX=192.168.100.
DATABASE_PATH=./data/aezakmi.sqlite
JWT_SECRET=replace-this
JWT_EXPIRES_IN=8h
SESSION_IDLE_TIMEOUT_MINUTES=10
SESSION_HEARTBEAT_SECONDS=30
CORS_ORIGIN=*
```

The frontend should point to the server:

```env
VITE_API_BASE_URL=http://192.168.100.10:3000/api
```

Replace `192.168.100.10` with the actual server LAN address.

## Seed Accounts

The initial development seed mirrors the frontend mock data:

- Admin username: `admin`
- Admin password: `admin123`
- Admin PIN: `2468`

Seeded member accounts are in `src/db/seed.js`.

Change development credentials before real cafe use.

## Important Design

`auth_sessions` and `computer_sessions` are deliberately separate.

- Authentication session = account login on a PC.
- Computer session = paid PC usage/time.

Logging out through **This PC** revokes the authentication session but does not automatically end the paid computer session.

Only one active authentication session is permitted per user account.
