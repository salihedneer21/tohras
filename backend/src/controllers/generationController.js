const Generation = require('../models/Generation');
const Training = require('../models/Training');
const User = require('../models/User');
const { replicate } = require('../config/replicate');
const fetch = require('node-fetch');
const fs = require('fs-extra');
const path = require('path');
const { downloadFromS3 } = require('../config/s3');
const { uploadGenerationOutputs } = require('../services/generationOutputs');
const fetchOpenRouter = require('node-fetch');
const { subscribeToGenerationUpdates } = require('../services/generationEvents');
const {
  dispatchGenerationAttempt,
  populateForClient,
  broadcastGeneration,
} = require('../services/generationWorkflow');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const RANKING_SYSTEM_PROMPT = `You are an art director for a children's storytelling studio. Given a user prompt, the child's reference details (name, gender, age), and four candidate images of the same child, rank the images best to worst.

Evaluate each image on these equally weighted criteria:
1. Facial likeness — the child's face must be clear, realistic, and consistent with the profile.
2. Body anatomy & proportions — limbs, posture, and scale should be natural and child-appropriate.
3. Wardrobe suitability — clothing should fit the prompt context, be neat, and appropriate for a child.
4. Composition & framing — the child should be centered or artfully framed, with minimal clipping.
5. Identity fidelity — the child must align with the provided gender and approximate age. Penalize any mismatched gender presentation or age-inappropriate depiction (e.g., toddler vs teenager).
6. Technical quality — lighting, background coherence, and absence of AI artifacts or hallucinated elements.

Return strict JSON with this schema:
{
  "summary": "short paragraph",
  "promptReflection": "one sentence about prompt alignment",
  "ranked": [
    {
      "imageIndex": <1-4>,
      "rank": <1-4>,
      "score": <0-100 integer>,
      "verdict": "excellent" | "good" | "fair" | "poor",
      "notes": "<=160 characters describing strengths/weaknesses"
    }
  ],
  "winners": [<imageIndex of best image>]
}

Rules:
- Ranks must be unique integers: 1 is best.
- Scores must correlate with rank (higher rank => higher score, no ties).
- Always provide notes for each image referencing at least one criterion.
- Call out any mismatches with the child's profile (gender, age) explicitly in the notes and lower the score accordingly.
- If you detect fatal issues (severe distortions, wrong subject, multiple people) lower the score drastically and explain why.
- You must base every judgment strictly on the actual visual evidence. Avoid assumptions or invented details not present in the image.
- Use the provided image indices (1..4) exactly.
`;

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

const clampScore = (value, fallback = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num < 0) return 0;
  if (num > 100) return 100;
  return Math.round(num);
};

async function rankGeneratedImages({ prompt, assets, childProfile }) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured for ranking');
  }

  const rankingModel =
    process.env.OPENROUTER_RANK_MODEL || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini-2024-07-18';

  const normalizedChildProfile = childProfile
    ? {
        name: childProfile.name || '',
        gender: childProfile.gender || '',
        age: typeof childProfile.age === 'number' ? childProfile.age : childProfile.age ? Number(childProfile.age) : null,
      }
    : null;

  const childDescriptorParts = [];
  if (normalizedChildProfile?.name) {
    childDescriptorParts.push(`Name: ${normalizedChildProfile.name}`);
  }
  if (normalizedChildProfile?.gender) {
    childDescriptorParts.push(`Gender: ${normalizedChildProfile.gender}`);
  }
  if (Number.isFinite(normalizedChildProfile?.age)) {
    childDescriptorParts.push(`Age: ${normalizedChildProfile.age}`);
  }

  const childDescriptor = childDescriptorParts.length
    ? `Child profile — ${childDescriptorParts.join(', ')}. Images must match this profile.`
    : 'Child profile not provided; prefer images that present a child consistent with the prompt.';

  const userContent = [
    {
      type: 'text',
      text: `${childDescriptor}`,
    },
    {
      type: 'text',
      text: `User prompt: "${prompt}". Evaluate and rank the following ${assets.length} images with emphasis on matching the child profile.`,
    },
  ];

  assets.forEach((asset, index) => {
    const label = `Image ${index + 1}`;
    userContent.push({ type: 'text', text: label });
    userContent.push({
      type: 'image_url',
      image_url: {
        url: asset.signedUrl || asset.url,
      },
    });
  });

  const payload = {
    model: rankingModel,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: RANKING_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  };

  const response = await fetchOpenRouter(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
      'X-Title': 'AI Book Story - Ranked Generator',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    const errMessage = data?.error?.message || data?.error || JSON.stringify(data);
    throw new Error(`Ranking model error: ${errMessage}`);
  }

  const messageContent = data?.choices?.[0]?.message?.content;
  if (!messageContent) {
    throw new Error('Ranking model returned empty content');
  }

  let parsed;
  try {
    parsed = JSON.parse(messageContent);
  } catch (error) {
    throw new Error('Ranking model returned invalid JSON');
  }

  const ranked = Array.isArray(parsed?.ranked) ? parsed.ranked : [];
  if (!ranked.length) {
    throw new Error('Ranking model did not return any results');
  }

  const cleanedRanked = ranked.map((entry, idx) => {
    const imageIndexRaw = entry.imageIndex ?? entry.index ?? idx + 1;
    const imageIndex = clampScore(imageIndexRaw, idx + 1);
    const rankRaw = entry.rank ?? idx + 1;
    const rank = clampScore(rankRaw, idx + 1);
    const scoreRaw = entry.score ?? entry.scorePercent ?? 70 - idx * 5;
    const score = clampScore(scoreRaw, 70 - idx * 5);
    const verdictRaw = (entry.verdict || '').toString().toLowerCase();
    const verdict = ['excellent', 'good', 'fair', 'poor'].includes(verdictRaw)
      ? verdictRaw
      : score >= 85
      ? 'excellent'
      : score >= 70
      ? 'good'
      : score >= 55
      ? 'fair'
      : 'poor';
    const notes = (entry.notes || '').toString().slice(0, 200);

    return {
      imageIndex,
      rank,
      score,
      verdict,
      notes,
    };
  });

  // Ensure ranks are unique and sequential by sorting
  const sorted = cleanedRanked.slice().sort((a, b) => a.rank - b.rank);
  sorted.forEach((entry, idx) => {
    entry.rank = idx + 1;
    if (!Number.isInteger(entry.imageIndex) || entry.imageIndex < 1 || entry.imageIndex > assets.length) {
      entry.imageIndex = idx + 1;
    }
  });

  const winners = Array.isArray(parsed?.winners) && parsed.winners.length
    ? parsed.winners.map((item) => clampScore(item, 1)).filter((item) => item >= 1 && item <= assets.length)
    : [sorted[0].imageIndex];

  return {
    summary: parsed.summary || '',
    promptReflection: parsed.promptReflection || parsed.prompt_reflection || '',
    ranked: sorted,
    winners,
    raw: parsed,
    childProfile: normalizedChildProfile,
  };
}

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

    const generation = await Generation.create({
      userId,
      trainingId,
      modelVersion: training.modelVersion,
      prompt: prompt.trim(),
      generationConfig: {
        model: 'ranked',
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
      status: 'processing',
    });

    try {
      const output = await replicate.run(training.modelVersion, { input: generationInput });
      const outputs = Array.isArray(output) ? output : [output];
      if (!outputs.length) {
        throw new Error('No output images returned from Replicate');
      }

      const { imageUrls, imageAssets } = await uploadGenerationOutputs({
        outputs,
        userId,
        generationId: generation._id,
        targetFormat: 'png',
        fallbackContentType: FORMAT_MIME_MAP.png,
      });

      const ranking = await rankGeneratedImages({
        prompt: prompt.trim(),
        assets: imageAssets,
        childProfile: {
          name: user.name,
          gender: user.gender,
          age: user.age,
        },
      });

      generation.status = 'succeeded';
      generation.imageUrls = imageUrls;
      generation.imageAssets = imageAssets;
      generation.ranking = {
        summary: ranking.summary,
        promptReflection: ranking.promptReflection || '',
        winners: ranking.winners && ranking.winners.length ? ranking.winners : [ranking.ranked[0]?.imageIndex || 1],
        ranked: ranking.ranked,
        createdAt: new Date(),
        raw: ranking.raw || null,
        childProfile: ranking.childProfile || {
          name: user.name,
          gender: user.gender,
          age: user.age,
        },
      };
      generation.completedAt = new Date();
      await generation.save();

      return res.status(201).json({
        success: true,
        message: 'Ranked images generated successfully',
        data: generation,
      });
    } catch (generationError) {
      generation.status = 'failed';
      generation.error = generationError.message;
      generation.completedAt = new Date();
      await generation.save().catch(() => {});

      throw generationError;
    }
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
