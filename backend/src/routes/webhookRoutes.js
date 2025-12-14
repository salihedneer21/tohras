const express = require('express');
const router = express.Router();
const replicateWebhookController = require('../controllers/replicateWebhookController');
const shopifyOrderWebhookController = require('../controllers/shopifyOrderWebhookController');

router.post('/replicate/:resourceType/:resourceId', replicateWebhookController.handleReplicateWebhook);

// Shopify order webhooks: /api/webhooks/shopify/orders/create
router.post('/shopify/orders/create', shopifyOrderWebhookController.handleShopifyOrderCreated);

module.exports = router;
