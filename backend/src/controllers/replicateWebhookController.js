const { verifyWebhookToken } = require('../utils/webhook');
const { processPredictionEvent } = require('../services/generationWorkflow');
const { processTrainingEvent } = require('../services/trainingWorkflow');

const SUPPORTED_RESOURCES = new Set(['generation', 'training']);

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
    console.warn(
      `⚠️  Webhook token verification failed for ${resourceType}:${resourceId} (token=${token || 'missing'})`
    );
    return res.status(401).json({
      success: false,
      message: 'Invalid webhook token',
    });
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'Invalid webhook payload',
    });
  }

  const eventType = determineEventType(req, payload);

  try {
    if (resourceType === 'generation') {
      console.log(
        `📨 Received Replicate webhook for generation ${resourceId} (event=${eventType}, status=${payload.status})`
      );
      await processPredictionEvent({
        generationId: resourceId,
        prediction: payload,
        eventType,
      });
    } else if (resourceType === 'training') {
      console.log(
        `📨 Received Replicate webhook for training ${resourceId} (event=${eventType}, status=${payload.status})`
      );
      await processTrainingEvent({
        trainingId: resourceId,
        replicateTraining: payload,
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
