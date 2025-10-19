const Generation = require('../models/Generation');
const Training = require('../models/Training');
const User = require('../models/User');
const { replicate } = require('../config/replicate');
const fetch = require('node-fetch');
const fs = require('fs-extra');
const path = require('path');
const { downloadFromS3 } = require('../config/s3');
const { subscribeToGenerationUpdates } = require('../services/generationEvents');
const {
  dispatchGenerationAttempt,
  populateForClient,
  broadcastGeneration,
} = require('../services/generationWorkflow');

/**
 * Get all generations
 * @route GET /api/generations
 */
exports.getAllGenerations = async (req, res) => {
  try {
    const { userId, trainingId, status } = req.query;
    const filter = {};

    if (userId) filter.userId = userId;
    if (trainingId) filter.trainingId = trainingId;
    if (status) filter.status = status;

    const generations = await Generation.find(filter)
      .populate('userId', 'name email')
      .populate('trainingId', 'modelName modelVersion')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: generations.length,
      data: generations,
    });
  } catch (error) {
    console.error('Error fetching generations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch generations',
      error: error.message,
    });
  }
};

/**
 * Get single generation by ID
 * @route GET /api/generations/:id
 */
exports.getGenerationById = async (req, res) => {
  try {
    const generation = await Generation.findById(req.params.id)
      .populate('userId', 'name email')
      .populate('trainingId', 'modelName modelVersion');

    if (!generation) {
      return res.status(404).json({
        success: false,
        message: 'Generation not found',
      });
    }

    res.status(200).json({
      success: true,
      data: generation,
    });
  } catch (error) {
    console.error('Error fetching generation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch generation',
      error: error.message,
    });
  }
};

const toNumber = (value, defaultValue) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

const toBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return Boolean(value);
};

const FORMAT_MIME_MAP = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/**
 * Generate images using fine-tuned model
 * @route POST /api/generations
 */
exports.generateImage = async (req, res) => {
  try {
    const { userId, trainingId, prompt, config } = req.body;

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Validate training exists and is successful
    const training = await Training.findById(trainingId);
    if (!training) {
      return res.status(404).json({
        success: false,
        message: 'Training not found',
      });
    }

    if (training.status !== 'succeeded' || !training.modelVersion) {
      return res.status(400).json({
        success: false,
        message: 'Training must be completed successfully before generating images',
      });
    }

    // Validate prompt
    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Prompt is required',
      });
    }

    // Prepare generation input
    const generationInput = {
      model: config?.model || 'dev',
      prompt: prompt,
      go_fast: toBoolean(config?.goFast, false),
      lora_scale: toNumber(config?.loraScale, 1),
      megapixels: config?.megapixels || '1',
      num_outputs: toNumber(config?.numOutputs, 1),
      aspect_ratio: config?.aspectRatio || '1:1',
      output_format: config?.outputFormat || 'webp',
      guidance_scale: toNumber(config?.guidanceScale, 3),
      output_quality: toNumber(config?.outputQuality, 80),
      prompt_strength: toNumber(config?.promptStrength, 0.8),
      extra_lora_scale: toNumber(config?.extraLoraScale, 1),
      num_inference_steps: toNumber(config?.numInferenceSteps, 28),
    };

    console.log('🎨 Generating images with model:', training.modelVersion);
    console.log('Generation Input:', generationInput);

    // Create generation record
    const createdAt = new Date();
    const generation = await Generation.create({
      userId,
      trainingId,
      modelVersion: training.modelVersion,
      prompt,
      generationConfig: {
        model: generationInput.model,
        goFast: generationInput.go_fast,
        loraScale: generationInput.lora_scale,
        megapixels: generationInput.megapixels,
        numOutputs: generationInput.num_outputs,
        aspectRatio: generationInput.aspect_ratio,
        outputFormat: generationInput.output_format,
        guidanceScale: generationInput.guidance_scale,
        outputQuality: generationInput.output_quality,
        promptStrength: generationInput.prompt_strength,
        extraLoraScale: generationInput.extra_lora_scale,
        numInferenceSteps: generationInput.num_inference_steps,
      },
      status: 'queued',
      progress: 0,
      attempts: 0,
      replicateInput: generationInput,
      events: [
        {
          type: 'created',
          message: 'Generation queued',
          metadata: {
            userId,
            trainingId,
          },
          timestamp: createdAt,
        },
      ],
    });

    await broadcastGeneration(generation._id);

    try {
      await dispatchGenerationAttempt({
        generationId: generation._id,
        modelVersion: training.modelVersion,
        input: generationInput,
        reason: 'initial',
      });
    } catch (dispatchError) {
      const failureTime = new Date();
      await Generation.findByIdAndUpdate(generation._id, {
        $set: {
          status: 'failed',
          error: dispatchError.message,
          completedAt: failureTime,
        },
        $push: {
          events: {
            type: 'error',
            message: `Failed to dispatch generation: ${dispatchError.message}`,
            metadata: { attempt: 1 },
            timestamp: failureTime,
          },
        },
      });
      await broadcastGeneration(generation._id);
      throw dispatchError;
    }

    const populatedGeneration = await populateForClient(generation._id);

    res.status(202).json({
      success: true,
      message: 'Image generation started',
      data: populatedGeneration,
    });
  } catch (error) {
    console.error('❌ Error generating image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate image',
      error: error.message,
    });
  }
};

exports.generateRankedImages = async (req, res) => {
  const { userId, trainingId, prompt } = req.body;

  try {
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Prompt is required',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const training = await Training.findById(trainingId);
    if (!training) {
      return res.status(404).json({
        success: false,
        message: 'Training not found',
      });
    }

    if (training.status !== 'succeeded' || !training.modelVersion) {
      return res.status(400).json({
        success: false,
        message: 'Training must be completed successfully before generating images',
      });
    }

    const generationInput = {
      prompt: prompt.trim(),
      guidance_scale: 2,
      output_quality: 100,
      output_format: 'png',
      num_outputs: 4,
      go_fast: false,
      num_inference_steps: 28,
      megapixels: '1',
      lora_scale: 1,
      extra_lora_scale: 1,
    };

    const createdAt = new Date();
    const generation = await Generation.create({
      userId,
      trainingId,
      modelVersion: training.modelVersion,
      prompt: prompt.trim(),
      generationConfig: {
        model: 'ranked',
        mode: 'ranked',
        goFast: Boolean(generationInput.go_fast),
        loraScale: generationInput.lora_scale,
        megapixels: generationInput.megapixels,
        numOutputs: generationInput.num_outputs,
        aspectRatio: generationInput.aspect_ratio || '1:1',
        outputFormat: generationInput.output_format,
        guidanceScale: generationInput.guidance_scale,
        outputQuality: generationInput.output_quality,
        promptStrength: generationInput.prompt_strength || 0.8,
        extraLoraScale: generationInput.extra_lora_scale,
        numInferenceSteps: generationInput.num_inference_steps,
      },
      status: 'queued',
      progress: 0,
      attempts: 0,
      replicateInput: generationInput,
      events: [
        {
          type: 'created',
          message: 'Ranked generation queued',
          metadata: {
            userId,
            trainingId,
            mode: 'ranked',
          },
          timestamp: createdAt,
        },
      ],
    });

    await broadcastGeneration(generation._id);

    try {
      await dispatchGenerationAttempt({
        generationId: generation._id,
        modelVersion: training.modelVersion,
        input: generationInput,
        reason: 'initial-ranked',
      });
    } catch (dispatchError) {
      const failureTime = new Date();
      await Generation.findByIdAndUpdate(generation._id, {
        $set: {
          status: 'failed',
          error: dispatchError.message,
          completedAt: failureTime,
        },
        $push: {
          events: {
            type: 'error',
            message: `Failed to dispatch ranked generation: ${dispatchError.message}`,
            metadata: { attempt: 1 },
            timestamp: failureTime,
          },
        },
      });
      await broadcastGeneration(generation._id);
      throw dispatchError;
    }

    const populatedGeneration = await populateForClient(generation._id);

    return res.status(202).json({
      success: true,
      message: 'Ranked generation started',
      data: populatedGeneration,
    });
  } catch (error) {
    console.error('❌ Error generating ranked images:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate ranked images',
      error: error.message,
    });
  }
};

/**
 * Download generated image to local storage
 * @route POST /api/generations/:id/download
 */
exports.downloadImage = async (req, res) => {
  try {
    const generation = await Generation.findById(req.params.id);

    if (!generation) {
      return res.status(404).json({
        success: false,
        message: 'Generation not found',
      });
    }

    if (generation.status !== 'succeeded' || generation.imageUrls.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No images available to download',
      });
    }

    // Create images folder if it doesn't exist
    const imagesFolder = process.env.IMAGES_FOLDER || './generated-images';
    await fs.ensureDir(imagesFolder);

    const downloadedFiles = [];
    const assets = generation.imageAssets || [];
    const defaultFormat = generation.generationConfig?.outputFormat || 'webp';

    const inferContentType = (value) => {
      if (!value) return null;
      const lowered = value.toLowerCase();
      if (lowered.includes('jpeg') || lowered.endsWith('.jpg') || lowered.endsWith('.jpeg')) return 'image/jpeg';
      if (lowered.includes('png') || lowered.endsWith('.png')) return 'image/png';
      if (lowered.includes('webp') || lowered.endsWith('.webp')) return 'image/webp';
      return null;
    };

    const urls = generation.imageUrls?.length
      ? generation.imageUrls
      : assets.map((asset) => asset?.url).filter(Boolean);

    for (let i = 0; i < urls.length; i++) {
      const asset = assets[i];
      const imageUrl = asset?.url || urls[i];
      const extensionFromOriginal = asset?.originalName ? path.extname(asset.originalName) : '';
      const extension = extensionFromOriginal || `.${defaultFormat}`;
      const safeExtension = extension.startsWith('.') ? extension : `.${extension}`;
      const fileName = `${generation._id}_${i}${safeExtension}`;
      const filePath = path.join(imagesFolder, fileName);

      let buffer;
      let contentType = asset?.contentType || inferContentType(extension) || 'application/octet-stream';

      if (asset?.key) {
        buffer = await downloadFromS3(asset.key);
        if (!buffer) {
          throw new Error(`Failed to fetch S3 object for key ${asset.key}`);
        }
      } else {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`Failed to download image ${i + 1}: ${response.status} ${response.statusText}`);
        }
        contentType = response.headers.get('content-type') || contentType;
        const arrayBuffer = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      }

      await fs.writeFile(filePath, buffer);

      downloadedFiles.push({
        fileName,
        filePath,
        url: imageUrl,
        contentType,
        size: buffer.length,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Images downloaded successfully',
      data: downloadedFiles,
    });
  } catch (error) {
    console.error('Error downloading images:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download images',
      error: error.message,
    });
  }
};

/**
 * Get generations by user
 * @route GET /api/generations/user/:userId
 */
exports.getGenerationsByUser = async (req, res) => {
  try {
    const generations = await Generation.find({ userId: req.params.userId })
      .populate('trainingId', 'modelName modelVersion')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: generations.length,
      data: generations,
    });
  } catch (error) {
    console.error('Error fetching user generations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user generations',
      error: error.message,
    });
  }
};

const serialiseGeneration = (payload) => {
  if (!payload) return null;
  if (typeof payload.toJSON === 'function') {
    return payload.toJSON();
  }
  return payload;
};

exports.streamGenerations = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (res.flushHeaders) {
    res.flushHeaders();
  }

  res.write(': stream-start\n\n');

  const send = (payload) => {
    const data = serialiseGeneration(payload);
    if (!data) return;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const unsubscribe = subscribeToGenerationUpdates(send);
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
};
