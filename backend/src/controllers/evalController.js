const { evaluateSingleImage } = require('../services/evaluator');

/**
 * Evaluate images for fine-tuning suitability using OpenRouter vision model
 * @route POST /api/evals
 */
exports.evaluateImages = async (req, res) => {
  try {
    const { image, images } = req.body || {};
    let targetImage = null;

    if (image && image.base64) {
      targetImage = image;
    } else if (Array.isArray(images) && images.length > 0) {
      if (images.length === 1 && images[0]?.base64) {
        targetImage = images[0];
      } else {
        return res.status(400).json({
          success: false,
          message: 'Only a single image may be evaluated at a time',
        });
      }
    }

    if (!targetImage || !targetImage.base64) {
      return res.status(400).json({
        success: false,
        message: 'Please provide one image to evaluate',
      });
    }

    const normalised = await evaluateSingleImage({
      name: targetImage.name,
      mimeType: targetImage.mimeType,
      base64: targetImage.base64,
    });

    return res.status(200).json({
      success: true,
      data: normalised,
    });
  } catch (error) {
    const statusCode = error.statusCode || error.status || 500;
    console.error('❌ Error evaluating images:', error);
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to evaluate images',
      error: error.details || undefined,
    });
  }
};
