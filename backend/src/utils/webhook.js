const crypto = require('crypto');

const getWebhookBaseUrl = () =>
  process.env.REPLICATE_WEBHOOK_BASE_URL ||
  process.env.WEBHOOK_BASE_URL ||
  process.env.APP_URL ||
  null;

const getWebhookSecret = () =>
  process.env.REPLICATE_WEBHOOK_SECRET ||
  process.env.WEBHOOK_SECRET ||
  null;

const generateWebhookToken = (resourceType, resourceId) => {
  const secret = getWebhookSecret();
  if (!secret) return null;

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${resourceType}:${resourceId}`);
  return hmac.digest('hex');
};

const buildWebhookUrl = (resourceType, resourceId) => {
  const baseUrl = getWebhookBaseUrl();
  if (!baseUrl) return null;

  const url = new URL(`/api/webhooks/replicate/${resourceType}/${resourceId}`, baseUrl);
  if (/\.ngrok/.test(url.hostname)) {
    url.searchParams.set('ngrok-skip-browser-warning', 'true');
  }
  const token = generateWebhookToken(resourceType, resourceId);
  if (token) {
    url.searchParams.set('token', token);
  }
  return url.toString();
};

const verifyWebhookToken = (resourceType, resourceId, token) => {
  const secret = getWebhookSecret();
  if (!secret) {
    // If no secret is configured, accept all webhooks (not recommended for production)
    return true;
  }

  if (!token || typeof token !== 'string') {
    return false;
  }

  const expected = generateWebhookToken(resourceType, resourceId);
  if (!expected) {
    return false;
  }

  const safeExpected = Buffer.from(expected, 'hex');
  const safeToken = Buffer.from(token, 'hex');

  if (safeExpected.length !== safeToken.length) {
    return false;
  }

  return crypto.timingSafeEqual(safeExpected, safeToken);
};

module.exports = {
  getWebhookBaseUrl,
  getWebhookSecret,
  generateWebhookToken,
  buildWebhookUrl,
  verifyWebhookToken,
};
