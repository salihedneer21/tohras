#!/usr/bin/env node
const { execSync } = require('child_process');

try {
  const output = execSync('curl -s http://127.0.0.1:4040/api/tunnels');
  const data = JSON.parse(output.toString());
  const tunnels = Array.isArray(data.tunnels) ? data.tunnels : [];
  const httpsTunnel = tunnels.find((t) => typeof t.public_url === 'string' && t.public_url.startsWith('https://'));
  if (!httpsTunnel) {
    console.error('No HTTPS tunnel found. Is ngrok running?');
    process.exit(1);
  }
  console.log(httpsTunnel.public_url);
} catch (error) {
  console.error('Failed to query ngrok:', error.message);
  process.exit(1);
}
