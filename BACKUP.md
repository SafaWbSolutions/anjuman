# Backups & restore

Anjuman takes an automatic full-database backup **every night at 02:30 IST**
(GitHub Actions → **Nightly backup**). Nothing in the app deletes data, so a
backup is a second safety net, not the first one.

## Where the backup goes

| Copy | Retention | Setup |
| --- | --- | --- |
| GitHub Actions artifact (`anjuman-backup-<run id>`) | 90 days | automatic |
| Cloudflare R2 `backups/YYYY/MM/DD/` | as long as you keep it | optional |
| Run summary (file name + size) | run history | automatic |

The job **fails loudly** if the dump is smaller than 2 KB or the gzip is
corrupt, so a "green" run always means a real backup exists.

## One-time setup

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Required | Value |
| --- | --- | --- |
| `SUPABASE_DB_URL` | yes | `postgresql://postgres:<DB_PASSWORD>@db.oytcwpemrrnqrbrtonyu.supabase.co:5432/postgres` |
| `BACKUP_PASSPHRASE` | recommended | a long random phrase — encrypts the dump (AES-256) |
| `R2_ACCESS_KEY_ID` | optional | Cloudflare R2 API token |
| `R2_SECRET_ACCESS_KEY` | optional | Cloudflare R2 API token |
| `R2_ENDPOINT` | optional | `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | optional | bucket name, e.g. `anjuman-backups` |

If R2 is not configured (or its credentials break) the run still succeeds and
keeps the GitHub artifact. A broken R2 upload can never lose the nightly copy.

Percent-encode special characters in the DB password (`@` → `%40`).

## Download a backup

1. GitHub → **Actions** → **Nightly backup** → pick a run.
2. Scroll to **Artifacts** → download `anjuman-backup-<run id>`.
3. Unzip → you get `anjuman-YYYYMMDD-HHMM.sql.gz` (or `.sql.gz.gpg`).

## Restore into a fresh Supabase project

```bash
# decrypt if BACKUP_PASSPHRASE was used
gpg --output anjuman.sql.gz --decrypt anjuman-YYYYMMDD-HHMM.sql.gz.gpg

gunzip -c anjuman-YYYYMMDD-HHMM.sql.gz | \
  psql "postgresql://postgres:<NEW_DB_PASSWORD>@db.<NEW_REF>.supabase.co:5432/postgres" \
       -v ON_ERROR_STOP=1
```

The dump is taken with `--clean --if-exists`, so it can be replayed over an
existing database. **Always restore into a new project first**, check the
numbers, then switch the app's `NEXT_PUBLIC_SUPABASE_URL` / anon key.

## Verify a backup without restoring

```bash
gunzip -c anjuman-YYYYMMDD-HHMM.sql.gz | head -40   # schema + comments
gunzip -c anjuman-YYYYMMDD-HHMM.sql.gz | grep -c "COPY public.members"
```

## Run one now

Actions → **Nightly backup** → **Run workflow**. It also runs automatically
whenever this workflow file changes, so the setup is tested on the next push.

## What is NOT in the dump

Supabase Storage objects (`avatars` photos, generated PDFs). Those are mirrored
by Cloudflare/Supabase separately; the database rows (members, payments,
invoices, ledger, approvals, support messages) are all included.
