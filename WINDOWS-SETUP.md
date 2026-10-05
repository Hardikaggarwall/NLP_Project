# Running Clause AI on Windows

## What you need

1. **Node.js 22 LTS or newer**: https://nodejs.org (use the Windows installer and keep the default options).
2. **Docker Desktop (optional)**: https://www.docker.com/products/docker-desktop. It provides persistent PostgreSQL storage.

No Redis, S3, email or AI keys are needed. Without PostgreSQL, uploaded files and analysis are kept in memory and are cleared when the API restarts.

## First-time setup

1. Unzip the folder somewhere with a short path, e.g. `C:\clause.ai`.
2. Double-click **`setup.bat`**. It will:
   - create `apps\api\.env` and `apps\web\.env` (with a freshly generated login secret),
  - try to start PostgreSQL in Docker,
   - install dependencies (`npm ci`, a few minutes the first time),
  - create database tables if PostgreSQL is available.

## Everyday use

- **Start**: double-click **`start.bat`**. The browser opens at http://localhost:5173.
- **Stop**: press `Ctrl+C` in the `start.bat` window.
- **Stop the database** (optional): double-click **`stop-db.bat`**. Your data is kept.

No sign-in is required. All visitors share the same guest account and can see
or change the same data, so do not expose the app to untrusted networks. Without
PostgreSQL, uploaded documents and analysis exist only in API memory and are
cleared on restart. To try it out, upload **`sample-rental-agreement.pdf`** from
the project folder.

| Service    | Address                 |
| ---------- | ----------------------- |
| Frontend   | http://localhost:5173   |
| Backend    | http://localhost:4000   |
| PostgreSQL | localhost:5432 (user `clause`, password `clause`, database `clause`) |

## Persistent storage without Docker

Install PostgreSQL 18 (it needs version 18 for the `uuidv7()` function), create a
database, and set the `DB_*` values in `apps\api\.env` to match. Without a
database, setup and startup continue using temporary in-memory storage.

## Troubleshooting

- **Port already in use**: change `PORT` in `apps\api\.env` and `VITE_API_URL` in
  `apps\web\.env` to the same new port, then restart.
- **`npm ci` fails**: delete the `node_modules` folder and run `setup.bat` again.
- **"Docker is installed but not running"**: open Docker Desktop, wait for it to
  start, then run the script again.
- **Scanned PDFs are slow**: they go through OCR, which can take a minute for
  long documents. Text-based PDFs are analyzed in about a second.
