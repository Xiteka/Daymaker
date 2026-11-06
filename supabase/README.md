# Daymaker Supabase setup

Project: `xqtejxjwjkzrzdrnikzz` (Daymaker), separate from little-love-arcade.

- Run `daymaker.sql` once in this project's SQL Editor. It creates two private tables and an atomic compare-and-swap save function. It does not alter other app tables or device data.
- The browser uses only the public publishable key in `src/supabase-config.js`. Never add database passwords, access tokens or service_role/secret keys to this repository.
- Auth Site URL and allowed redirect: `https://xiteka.github.io/Daymaker/`.
- Email/password accounts use email confirmation. For signup and password reset emails to friends, configure production SMTP in Authentication → Emails. Supabase's built-in email sender is restricted to organization team addresses.

## Device data and sync

The legacy `daymark-tracker-v1` record remains intact when logging in. Before the first import, a second original-device backup is saved locally. The first account used on a device claims that guest data; signing into another account does not import it automatically. Account caches are stored separately by user ID.

On login, device records merge into the account by their existing IDs. No account collection is blindly replaced with a device's collection. Each successful save checks the server revision. Unrelated changes from different devices merge; conflicting changes to the same record pause for a user choice. Before conflict resolution, both documents are saved in the private backup table. New edits made during a network request remain queued. Offline edits are saved locally and retry on reconnect, app focus, and while the app stays open.

Settings are under Log in / Account → Your settings. Device and account backups can be downloaded from the account dialog. Logging out keeps account caches and returns to the original local guest data; it does not erase the database.

## Release

Keep `src/` and `docs/` synchronized, including cloud/config/vendor files. Bump service-worker and changed asset query versions. The Pages workflow publishes only `docs/`.

Do not remove or rename the legacy storage key, clear storage during deployment, disable RLS, or add anonymous table policies. Sharing between friends is not enabled: every account is private.
