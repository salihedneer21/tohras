const express = require('express');
const router = express.Router();
const replicateWebhookController = require('../controllers/replicateWebhookController');

router.post('/replicate/:resourceType/:resourceId', replicateWebhookController.handleReplicateWebhook);

module.exports = router;
