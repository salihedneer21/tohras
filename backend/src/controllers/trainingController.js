const Training = require('../models/Training');
const User = require('../models/User');
const { replicate } = require('../config/replicate');
const fetch = require('node-fetch');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const {
  uploadBufferToS3,
  deleteFromS3,
  generateTrainingImageKey,
  generateTrainingZipKey,
  downloadFromS3,
} = require('../config/s3');

const MAX_TRAINING_IMAGES = 25;

const guessContentType = (fileName = '') => {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    case '.tiff':
    case '.tif':
      return 'image/tiff';
    case '.jpeg':
    case '.jpg':
    default:
      return 'image/jpeg';
  }
};

const buildFileNameFromAsset = (asset, index) => {
  if (!asset) {
    return `training-image-${index + 1}.jpg`;
  }

  if (asset.originalName) {
    return asset.originalName;
  }

  if (asset.key) {
    return path.basename(asset.key);
  }

  if (asset.name) {
    return asset.name;
  }

  return `training-image-${index + 1}.jpg`;
};

const normaliseUrl = (url) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.toString();
  } catch (error) {
    return encodeURI(url);
  }
};

const downloadAssetBuffer = async (asset, index) => {
  if (!asset) return null;

  if (asset.key) {
    try {
      const buffer = await downloadFromS3(asset.key);
      if (buffer && buffer.length > 0) {
        return buffer;
      }
    } catch (error) {
      console.warn(`⚠️  Failed to download asset ${asset.key} from S3: ${error.message}`);
    }
  }

  if (asset.url) {
    const targetUrl = normaliseUrl(asset.url);
    if (!targetUrl) return null;
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image from ${targetUrl} (status ${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  console.warn(`⚠️  Asset at index ${index} had neither key nor URL. Skipping.`);
  return null;
};

/**
 * Get all training jobs
 * @route GET /api/trainings
 */
exports.getAllTrainings = async (req, res) => {
  try {
    const { userId, status } = req.query;
    const filter = {};

    if (userId) filter.userId = userId;
    if (status) filter.status = status;

    const trainings = await Training.find(filter)
      .populate('userId', 'name email age gender')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: trainings.length,
      data: trainings,
    });
  } catch (error) {
    console.error('Error fetching trainings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trainings',
      error: error.message,
    });
  }
};

/**
 * Get single training by ID
 * @route GET /api/trainings/:id
 */
exports.getTrainingById = async (req, res) => {
  try {
    const training = await Training.findById(req.params.id).populate(
      'userId',
      'name email age gender'
    );

    if (!training) {
      return res.status(404).json({
        success: false,
        message: 'Training not found',
      });
    }

    res.status(200).json({
      success: true,
      data: training,
    });
  } catch (error) {
    console.error('Error fetching training:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch training',
      error: error.message,
    });
  }
};

/**
 * Start fine-tuning for a user
 * @route POST /api/trainings
 */
exports.startTraining = async (req, res) => {
  const incomingFiles = Array.isArray(req.files) ? req.files : [];
  let uploadedAssets = [];
  let generatedZipKey = null;
  let localZipPath;

  try {
    const { userId } = req.body;
    const modelName = req.body.modelName;
    const trainingConfigInput =
      req.body.trainingConfig && typeof req.body.trainingConfig === 'object'
        ? req.body.trainingConfig
        : {};

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const useUserAssets = incomingFiles.length === 0;
    let sourceAssets = [];
    let userAssetIdsUsed = [];

    if (useUserAssets) {
      const userAssets = Array.isArray(user.imageAssets) ? user.imageAssets : [];
      if (!userAssets.length) {
        return res.status(400).json({
          success: false,
          message: 'Selected user has no uploaded images. Add reference photos before starting training.',
        });
      }

      const assetsToProcess = userAssets.slice(0, MAX_TRAINING_IMAGES);
      userAssetIdsUsed = assetsToProcess.map((asset) => asset._id);

      for (let index = 0; index < assetsToProcess.length; index += 1) {
        const asset = assetsToProcess[index];
        try {
          const buffer = await downloadAssetBuffer(asset, index);

          if (!buffer || buffer.length === 0) {
            console.warn(`⚠️  Skipping empty buffer for asset index ${index} (user ${userId})`);
            continue;
          }

          const originalName = buildFileNameFromAsset(asset, index);
          sourceAssets.push({
            buffer,
            originalName,
            contentType: asset.contentType || guessContentType(originalName),
            size: buffer.length,
          });
        } catch (downloadError) {
          throw new Error(
            `Failed to load user asset "${asset?.originalName || asset?.key || index}" for training: ${downloadError.message}`
          );
        }
      }

      if (!sourceAssets.length) {
        return res.status(400).json({
          success: false,
          message: 'Unable to load user images for training. Please verify the uploaded files and try again.',
        });
      }
    } else {
      sourceAssets = incomingFiles.map((file, index) => ({
        buffer: file.buffer,
        originalName: file.originalname || buildFileNameFromAsset(file, index),
        contentType: file.mimetype || guessContentType(file.originalname),
        size: file.size,
      }));
    }

    if (!sourceAssets.length) {
      return res.status(400).json({
        success: false,
        message: 'No training images available. Upload reference photos for the user before starting training.',
      });
    }

    const timestamp = Date.now();
    const baseModelName = (modelName || user.name.toLowerCase()).replace(/[^a-z0-9-]/g, '-');
    const uniqueModelName = `${baseModelName}-${timestamp}`;

    if (sourceAssets.length < 10) {
      console.log(
        `⚠️  Only ${sourceAssets.length} training images provided for ${uniqueModelName}. More images improve fine-tuning quality.`
      );
    }

    console.log(
      `📸 Preparing ${sourceAssets.length} training images for ${uniqueModelName} (source: ${
        useUserAssets ? 'user-library' : 'direct-upload'
      })`
    );

    const tempDir = path.join(os.tmpdir(), 'training-zips');
    await fs.ensureDir(tempDir);
    localZipPath = path.join(tempDir, `${uniqueModelName}.zip`);

    const zipOutput = fs.createWriteStream(localZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    const archivePromise = new Promise((resolve, reject) => {
      zipOutput.on('close', resolve);
      archive.on('error', reject);
    });
    archive.pipe(zipOutput);

    const uploadPromises = sourceAssets.map((asset, index) => {
      const fileName = asset.originalName || `training-image-${index + 1}.jpg`;
      archive.append(asset.buffer, { name: fileName });
      const key = generateTrainingImageKey(uniqueModelName, fileName, index);
      return uploadBufferToS3(asset.buffer, key, asset.contentType, { acl: 'public-read' }).then(({ url }) => ({
        key,
        url,
        size: asset.size ?? asset.buffer.length,
        contentType: asset.contentType,
        uploadedAt: new Date(),
        originalName: fileName,
      }));
    });

    await archive.finalize();
    await archivePromise;

    uploadedAssets = await Promise.all(uploadPromises);

    const zipBuffer = await fs.readFile(localZipPath);
    generatedZipKey = generateTrainingZipKey(uniqueModelName);
    const { url: zipUrl } = await uploadBufferToS3(zipBuffer, generatedZipKey, 'application/zip', { acl: 'public-read' });
    await fs.remove(localZipPath);

    console.log('🌐 Uploaded dataset ZIP to S3:', zipUrl);

    const triggerWord = baseModelName;
    const trainingInput = {
      input_images: zipUrl,
      steps: trainingConfigInput?.steps ? Number(trainingConfigInput.steps) : 1000,
      lora_rank: trainingConfigInput?.loraRank ? Number(trainingConfigInput.loraRank) : 16,
      batch_size: trainingConfigInput?.batchSize ? Number(trainingConfigInput.batchSize) : 1,
      learning_rate: trainingConfigInput?.learningRate ? Number(trainingConfigInput.learningRate) : 0.0004,
      trigger_word: triggerWord,
    };

    console.log('🚀 Starting training with Replicate...');
    console.log('Training Config:', trainingInput);

    const trainingOptions = {
      input: trainingInput,
    };

    if (process.env.REPLICATE_USERNAME) {
      const destinationPath = `${process.env.REPLICATE_USERNAME}/${uniqueModelName}`;
      trainingOptions.destination = destinationPath;
      try {
        await replicate.models.create(process.env.REPLICATE_USERNAME, uniqueModelName, {
          visibility: 'private',
          hardware: 'gpu-t4',
          description: `Fine-tuned Flux model for ${user.name} (trigger: ${triggerWord})`,
        });
        console.log('✅ Model created on Replicate');
      } catch (modelError) {
        console.error('❌ Model creation failed:', modelError.message);
        throw new Error(`Failed to create model: ${modelError.message}`);
      }
    } else {
      console.log('⚠️  No REPLICATE_USERNAME set - training will not be saved to account');
    }

    const training = await replicate.trainings.create(
      'ostris',
      'flux-dev-lora-trainer',
      'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      trainingOptions
    );

    console.log('✅ Training started:', training.id);

    const trainingConfigRecord = {
      steps: trainingInput.steps,
      learningRate: trainingInput.learning_rate,
      batchSize: trainingInput.batch_size,
      triggerWord,
      source: useUserAssets ? 'user-library' : 'upload',
      zipPath: generatedZipKey,
      zipUrl,
    };

    if (useUserAssets && userAssetIdsUsed.length) {
      trainingConfigRecord.userAssetIds = userAssetIdsUsed;
    }

    const newTraining = await Training.create({
      userId,
      replicateTrainingId: training.id,
      modelName: uniqueModelName,
      imageUrls: uploadedAssets.map((asset) => asset.url),
      imageAssets: uploadedAssets,
      status: training.status,
      logsUrl: training.logs,
      trainingConfig: trainingConfigRecord,
    });

    res.status(201).json({
      success: true,
      message: 'Training started successfully',
      data: newTraining,
    });
  } catch (error) {
    console.error('❌ Error starting training:', error);
    if (generatedZipKey) {
      try {
        await deleteFromS3(generatedZipKey);
      } catch (cleanupError) {
        console.warn('⚠️  Failed to delete zip from S3 after error:', cleanupError.message);
      }
    }
    if (uploadedAssets.length) {
      await Promise.all(
        uploadedAssets.map((asset) =>
          deleteFromS3(asset.key).catch((cleanupError) =>
            console.warn('⚠️  Failed to delete image from S3 after error:', cleanupError.message)
          )
        )
      );
    }
    if (localZipPath) {
      await fs.remove(localZipPath).catch(() => {});
    }
    res.status(500).json({
      success: false,
      message: 'Failed to start training',
      error: error.message,
    });
  }
};

/**
 * Check training status
 * @route GET /api/trainings/:id/status
 */
exports.checkTrainingStatus = async (req, res) => {
  try {
    const training = await Training.findById(req.params.id);

    if (!training) {
      return res.status(404).json({
        success: false,
        message: 'Training not found',
      });
    }

    // Get status from Replicate
    const replicateTraining = await replicate.trainings.get(training.replicateTrainingId);

    // Update training in database
    training.status = replicateTraining.status;
    training.logsUrl = replicateTraining.logs;

    if (replicateTraining.status === 'succeeded') {
      training.modelVersion = replicateTraining.output?.version;
      training.completedAt = new Date();
    } else if (replicateTraining.status === 'failed') {
      training.error = replicateTraining.error || 'Training failed';
      training.completedAt = new Date();
    }

    await training.save();

    res.status(200).json({
      success: true,
      data: training,
    });
  } catch (error) {
    console.error('Error checking training status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check training status',
      error: error.message,
    });
  }
};

/**
 * Cancel training
 * @route POST /api/trainings/:id/cancel
 */
exports.cancelTraining = async (req, res) => {
  try {
    const training = await Training.findById(req.params.id);

    if (!training) {
      return res.status(404).json({
        success: false,
        message: 'Training not found',
      });
    }

    // Cancel training on Replicate
    await replicate.trainings.cancel(training.replicateTrainingId);

    training.status = 'canceled';
    training.completedAt = new Date();
    await training.save();

    res.status(200).json({
      success: true,
      message: 'Training canceled successfully',
      data: training,
    });
  } catch (error) {
    console.error('Error canceling training:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel training',
      error: error.message,
    });
  }
};

/**
 * Get successful trainings for a user (for dropdown in generation)
 * @route GET /api/trainings/user/:userId/successful
 */
exports.getUserSuccessfulTrainings = async (req, res) => {
  try {
    const trainings = await Training.find({
      userId: req.params.userId,
      status: 'succeeded',
      modelVersion: { $ne: null },
    })
      .select('modelName modelVersion createdAt completedAt')
      .sort({ completedAt: -1 });

    res.status(200).json({
      success: true,
      count: trainings.length,
      data: trainings,
    });
  } catch (error) {
    console.error('Error fetching successful trainings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch successful trainings',
      error: error.message,
    });
  }
};
