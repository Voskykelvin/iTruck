const fs = require('fs');
const path = require('path');

const workspacePublic = path.join(__dirname, '../workspace/public');
const manifestPath = path.join(workspacePublic, 'manifest.webmanifest');

function fail(message) {
  console.error(`PWA verification failed: ${message}`);
  process.exitCode = 1;
}

function pngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error(`${filePath} is not a PNG file`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

if (!fs.existsSync(manifestPath)) {
  fail('manifest.webmanifest is missing');
  process.exit();
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const requiredFields = ['id', 'name', 'short_name', 'start_url', 'scope', 'display', 'theme_color', 'background_color'];

for (const field of requiredFields) {
  if (!manifest[field]) fail(`manifest field "${field}" is missing`);
}

if (!['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display)) {
  fail(`manifest display mode "${manifest.display}" is not installable`);
}

for (const requiredSize of [192, 512]) {
  const icon = manifest.icons?.find((candidate) =>
    candidate.sizes?.split(/\s+/).includes(`${requiredSize}x${requiredSize}`)
  );
  if (!icon) {
    fail(`a ${requiredSize}x${requiredSize} manifest icon is missing`);
    continue;
  }

  const iconPath = path.join(workspacePublic, icon.src.replace(/^\//, ''));
  if (!fs.existsSync(iconPath)) {
    fail(`icon file ${icon.src} is missing`);
    continue;
  }

  const dimensions = pngDimensions(iconPath);
  if (dimensions.width !== requiredSize || dimensions.height !== requiredSize) {
    fail(`${icon.src} is ${dimensions.width}x${dimensions.height}, expected ${requiredSize}x${requiredSize}`);
  }
}

const requiredFiles = ['offline.html', 'push-service-worker.js', 'assets/icon-maskable-512.png'];
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(workspacePublic, file))) fail(`${file} is missing`);
}

if (!process.exitCode) console.log('PWA verification passed.');
