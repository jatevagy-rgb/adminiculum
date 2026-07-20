# Client Color Module Local QA

## Environment

- Disposable local PostgreSQL database: `adminiculum_client_color_rollout_qa`.
- Backend: `http://127.0.0.1:3101`.
- Frontend: `http://127.0.0.1:3100`.
- Authentication: local-development account with a synthetic `.invalid` email.
- Data: four synthetic clients, four cases, four tasks, four communications, four review rows, and two notifications.
- Production, Azure, clone, and real client data were not used.

## API Proof

Authenticated checks returned `200` for health, cases, tasks, agenda, case dashboard stats, communications, notifications, review queue, and a colored review detail. Communications returned four rows at requested limit `50`, including assigned and neutral rows. Notifications returned two rows and zero non-null client colors.

## Mutation Proof

- Dashboard: RED to PURPLE updated after refresh; clearing the color produced neutral fallback; RED was restored.
- Communications: reassignment from Alpha to Beta changed case, client, list accent, and selected detail accent after refresh.
- Review: BLUE to PURPLE updated queue and detail after refresh; BLUE was restored.

The disposable database is removed during closeout after validation.
