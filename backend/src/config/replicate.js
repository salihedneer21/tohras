const Replicate = require('replicate');

/**
 * Initialize Replicate client with API token
 */
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/**
 * Validate Replicate API token
 */
const validateReplicateToken = () => {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error('❌ REPLICATE_API_TOKEN is not set in environment variables');
    process.exit(1);
  }
  console.log('✅ Replicate API token configured');
};

module.exports = {
  replicate,
  validateReplicateToken,
};
