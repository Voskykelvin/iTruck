require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const target = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(path.join(target, 'manifest.json'))) {
  console.error('Usage: CONFIRM_RESTORE=RESTORE node backend/scripts/restore-mongodb.js <backup-directory>');
  process.exit(1);
}
if (process.env.CONFIRM_RESTORE !== 'RESTORE') {
  console.error('Restore refused. Set CONFIRM_RESTORE=RESTORE after verifying the target environment and backup.');
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is required.');
  process.exit(1);
}

const verification = spawnSync(process.execPath, [path.join(__dirname, 'verify-backup.js'), target], {
  stdio: 'inherit'
});
if (verification.status !== 0) process.exit(verification.status || 1);

const args = ['--uri', process.env.MONGODB_URI, '--drop', target];
const result = spawnSync('mongorestore', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});
if (result.error || result.status !== 0) {
  console.error(result.error?.message || `mongorestore exited with status ${result.status}`);
  process.exit(result.status || 1);
}
console.log(`MongoDB restore completed from ${target}`);
