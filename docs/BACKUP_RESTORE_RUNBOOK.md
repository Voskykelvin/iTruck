# Backup and Restore Runbook

Create a backup with `npm run backup:create`. The script runs `mongodump`, stores the result below `BACKUP_DIR` (default `backups/`), and writes a SHA-256 manifest.

Verify it with:

```sh
npm run backup:verify -- backups/mongodb-TIMESTAMP
```

Restore only into an explicitly selected environment:

```sh
CONFIRM_RESTORE=RESTORE npm run backup:restore -- backups/mongodb-TIMESTAMP
```

The restore command verifies checksums first and uses `mongorestore --drop`. Test restores against an isolated database at least weekly. Encrypt backup storage, restrict access, keep copies in a separate provider/account, and monitor backup age and failed jobs.
