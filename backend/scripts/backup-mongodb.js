require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is required.');
  process.exit(1);
}

const root = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '../../backups'));
const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const destination = path.join(root, `mongodb-${timestamp}`);
fs.mkdirSync(destination, { recursive: true });

const result = spawnSync('mongodump', ['--uri', uri, '--out', destination], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});
if (result.error || result.status !== 0) {
  console.error(result.error?.message || `mongodump exited with status ${result.status}`);
  process.exit(result.status || 1);
}

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(fullPath) : [fullPath];
  });
}

const files = filesBelow(destination).map((file) => ({
  path: path.relative(destination, file).replaceAll('\\', '/'),
  bytes: fs.statSync(file).size,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}));
const manifest = {
  format: 'itruck-mongodb-backup-v1',
  createdAt: new Date().toISOString(),
  source: uri.replace(/\/\/([^@/]+)@/, '//[credentials]@'),
  files
};
fs.writeFileSync(path.join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`MongoDB backup created: ${destination}`);
