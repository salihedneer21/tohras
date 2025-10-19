#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

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
  } catch (error) {}
});

const secret = process.env.REPLICATE_WEBHOOK_SECRET;
const baseUrl = process.env.REPLICATE_WEBHOOK_BASE_URL;

if (!secret) {
  console.error('REPLICATE_WEBHOOK_SECRET is not set.');
  process.exit(1);
}

if (!baseUrl) {
  console.error('REPLICATE_WEBHOOK_BASE_URL is not set.');
  process.exit(1);
}

const [resourceType = 'generation', resourceId = 'test-webhook-123', status = 'succeeded'] = process.argv.slice(2);

const hmac = crypto.createHmac('sha256', secret);
hmac.update(`${resourceType}:${resourceId}`);
const token = hmac.digest('hex');

const targetUrl = new URL(`/api/webhooks/replicate/${resourceType}/${resourceId}`, baseUrl);
if (/\.ngrok/.test(targetUrl.hostname)) {
  targetUrl.searchParams.set('ngrok-skip-browser-warning', 'true');
}
targetUrl.searchParams.set('token', token);

(async () => {
  try {
    const response = await fetch(targetUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Replicate-Event': 'completed',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ id: 'manual-test', status }),
    });

    const text = await response.text();
    console.log(`POST ${targetUrl.toString()} => ${response.status}`);
    console.log(text);
  } catch (error) {
    console.error('Failed to send webhook:', error.message);
    process.exit(1);
  }
})();
