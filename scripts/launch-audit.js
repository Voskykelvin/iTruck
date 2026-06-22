const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env.production') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const required = [
  'MONGODB_URI',
  'JWT_SECRET',
  'DELIVERY_OTP_PEPPER',
  'FRONTEND_URL',
  'ALLOWED_ORIGINS',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'METRICS_AUTH_TOKEN'
];
const files = [
  'docs/PRIVACY.md',
  'docs/TERMS.md',
  'docs/OPERATIONS_RUNBOOK.md',
  'docs/BACKUP_RESTORE_RUNBOOK.md',
  'docs/ROLLBACK_RUNBOOK.md'
];
const checks = [
  ...required.map((name) => ({ name: `env:${name}`, passed: Boolean(process.env[name]) })),
  ...files.map((name) => ({ name: `file:${name}`, passed: fs.existsSync(path.join(__dirname, '..', name)) })),
  {
    name: 'env:JWT_SECRET strength',
    passed: Boolean(
      process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32 && process.env.JWT_SECRET !== 'dev-secret'
    )
  },
  {
    name: 'env:cookie security',
    passed: String(process.env.AUTH_COOKIE_SAMESITE || '').toLowerCase() === 'none'
  }
];
const result = {
  generatedAt: new Date().toISOString(),
  passed: checks.every((check) => check.passed),
  checks
};
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exit(1);
