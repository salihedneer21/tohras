#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');

const dotEnvCandidates = [
  process.env.DOTENV_PATH,
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), '.env'),
].filter(Boolean);

dotEnvCandidates.forEach((candidate) => {
  if (!candidate) return;
  try {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, override: false });
    }
  } catch (error) {
    // ignore missing paths
  }
});

const secret = process.env.REPLICATE_WEBHOOK_SECRET;
if (!secret) {
  console.error('REPLICATE_WEBHOOK_SECRET is not set.');
  process.exit(1);
}

const [resourceType = 'generation', resourceId = 'test-webhook-123'] = process.argv.slice(2);

const hmac = crypto.createHmac('sha256', secret);
hmac.update(`${resourceType}:${resourceId}`);

const token = hmac.digest('hex');

console.log(`resource: ${resourceType}`);
console.log(`id      : ${resourceId}`);
console.log(`token   : ${token}`);
