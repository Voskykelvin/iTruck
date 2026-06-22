const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const target = path.resolve(process.argv[2] || '');
const manifestPath = path.join(target, 'manifest.json');
if (!process.argv[2] || !fs.existsSync(manifestPath)) {
  console.error('Usage: node backend/scripts/verify-backup.js <backup-directory>');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];
for (const record of manifest.files || []) {
  const file = path.resolve(target, record.path);
  if (!file.startsWith(`${target}${path.sep}`) || !fs.existsSync(file)) {
    failures.push(`${record.path}: missing or outside backup directory`);
    continue;
  }
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (digest !== record.sha256) failures.push(`${record.path}: checksum mismatch`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Backup verified: ${manifest.files.length} files, created ${manifest.createdAt}`);
