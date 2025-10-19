const { verifyWebhookToken } = require('../utils/webhook');
const { processPredictionEvent } = require('../services/generationWorkflow');

const SUPPORTED_RESOURCES = new Set(['generation']);

const determineEventType = (req, prediction) => {
  const headerEvent = req.get('x-replicate-event');
  if (headerEvent) return headerEvent;
  if (prediction?.event) return prediction.event;
  if (prediction?.status === 'succeeded' || prediction?.status === 'failed' || prediction?.status === 'canceled') {
    return 'completed';
  }
  return 'update';
};

exports.handleReplicateWebhook = async (req, res) => {
  const { resourceType, resourceId } = req.params;

  if (!SUPPORTED_RESOURCES.has(resourceType)) {
    console.warn(`⚠️  Received webhook for unsupported resource type: ${resourceType}`);
    return res.status(202).json({
      success: true,
      ignored: true,
    });
  }

  const token = req.query.token;
  if (!verifyWebhookToken(resourceType, resourceId, token)) {
    console.warn('⚠️  Webhook token verification failed');
    return res.status(401).json({
      success: false,
      message: 'Invalid webhook token',
    });
  }

  const prediction = req.body;
  if (!prediction || typeof prediction !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'Invalid webhook payload',
    });
  }

  const eventType = determineEventType(req, prediction);

  try {
    if (resourceType === 'generation') {
      await processPredictionEvent({
        generationId: resourceId,
        prediction,
        eventType,
      });
    }

    return res.status(200).json({
      success: true,
      received: true,
    });
  } catch (error) {
    console.error('❌ Error processing Replicate webhook:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process webhook',
      error: error.message,
    });
  }
};
