#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

// Load environment variables from backend/.env (primary) and fall back to a
// root .env if needed.
const backendEnvPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath, override: false });
} else {
  dotenv.config();
}

const baseUrl = process.env.PRINTING_BASE_URL;
const apiKey = process.env.PRINTING_SERVICE_API_KEY;
// Kept for future use if signatures are required
// eslint-disable-next-line no-unused-vars
const secretKey = process.env.PRINTING_SECRET_KEY || '';

if (!baseUrl) {
  console.error('PRINTING_BASE_URL is not set in backend/.env');
  process.exit(1);
}

if (!apiKey) {
  console.error('PRINTING_SERVICE_API_KEY is not set in backend/.env');
  process.exit(1);
}

const [inputPath] = process.argv.slice(2);

if (!inputPath) {
  console.error(
    'Usage: node backend/scripts/submit-print-order.js <order-json-path>\n' +
      'Example: node backend/scripts/submit-print-order.js api-sandbox/order-6455229448415.json'
  );
  process.exit(1);
}

const jsonFilePath = path.resolve(process.cwd(), inputPath);

if (!fs.existsSync(jsonFilePath)) {
  console.error(`JSON file not found: ${jsonFilePath}`);
  process.exit(1);
}

let payload;
try {
  const raw = fs.readFileSync(jsonFilePath, 'utf8');
  payload = JSON.parse(raw);
} catch (error) {
  console.error('Failed to read/parse JSON payload:', error.message);
  process.exit(1);
}

// Build endpoint without losing any path segments from PRINTING_BASE_URL.
// If PRINTING_BASE_URL is "https://api.partner-connect.io/api/gsb/xxxx",
// this produces "https://api.partner-connect.io/api/gsb/xxxx/order".
const endpoint = `${baseUrl.replace(/\/+$/, '')}/order`;

const responsesDir = path.resolve(__dirname, '../../api-sandbox/responses');
fs.mkdirSync(responsesDir, { recursive: true });
const baseName = path.basename(jsonFilePath);
const outputFile = path.join(
  responsesDir,
  `${baseName.replace(/\.json$/i, '')}-response.json`
);

(async () => {
  try {
    console.log(`→ POST ${endpoint}`);
    console.log(`→ Using payload from: ${jsonFilePath}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    console.log(`← Status: ${response.status}`);
    if (text) {
      console.log('← Body:');
      console.log(text);
    }

    fs.writeFileSync(outputFile, text || '');
    console.log(`→ Response saved to: ${outputFile}`);
  } catch (error) {
    console.error('Failed to submit print order:', error.message);
    process.exit(1);
  }
})();
