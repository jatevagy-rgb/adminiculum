# Adminiculum

Adminiculum is a legal-ops application with separate frontend and backend projects.

## Project roots

- Frontend root: `Frontend/`
- Backend root: `Backend/`

## Stack

- Frontend: Next.js App Router
- Backend: Express + TypeScript + Prisma
- Database: PostgreSQL (via Prisma)

## Local development defaults

- Frontend dev port: `3000`
- Backend dev port: `3001`

## Security and repository hygiene

- Do **not** commit secrets.
- Do **not** commit `.env` files.
- Commit only safe templates such as `.env.example` files with placeholder values.

## Local setup note

Use local placeholder configuration files for setup and replace placeholders only in local, uncommitted `.env` files.

