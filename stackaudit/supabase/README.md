# Supabase database setup

## Canonical schema source

`supabase/migrations/` is the canonical schema history. A fresh database is built by `supabase db reset`, which replays the ordered migrations from an empty local database. Existing databases are upgraded by applying the same forward migrations. CI verifies this clean replay on every pull request and main branch push.

`full_setup.sql` is a retained legacy, all-in-one schema snapshot at the repository root. No current script, workflow, or documentation uses it to install or upgrade a database. It predates the current migration sequence and duplicates schema definitions that have since evolved. Keep it for historical reference only; do not execute it as an alternative provisioning path or combine it with migrations. Migration changes must be added as new forward-only SQL files under `supabase/migrations/`.

Pricing catalog fixtures and demo data are application data, not schema migrations. They are loaded separately with `npm run pricing:load` and `npm run seed` after migrations. CI's migration and pgTAP checks do not connect to production or load personal data.

## Local and CI verification

```sh
npx supabase start
npx supabase db reset
npx supabase test db
npm run test:integration
npx supabase stop --no-backup
```

The GitHub Actions database job uses the Supabase CLI version resolved by `package-lock.json`, starts only the local services needed by the tests, and obtains test credentials from `supabase status`. The service-role key remains a job environment value and is not emitted in logs. No GitHub secrets or production credentials are required.
