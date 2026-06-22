const { spawnSync } = require('child_process');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message || `${command} ${args.join(' ')} failed`);
    process.exit(result.status || 1);
  }
}

run('docker', ['version']);
run('docker', ['compose', 'config', '--quiet']);
run('docker', ['build', '--tag', 'itruck:verification', '.']);

if (process.argv.includes('--smoke')) {
  const project = `itruck-verify-${Date.now()}`;
  try {
    run('docker', ['compose', '--project-name', project, 'up', '--detach', '--wait', '--wait-timeout', '120']);
    run('docker', ['compose', '--project-name', project, 'ps']);
  } finally {
    spawnSync('docker', ['compose', '--project-name', project, 'down', '--volumes'], {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
  }
}

console.log('Docker verification passed.');
