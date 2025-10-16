const Training = require('../models/Training');
const User = require('../models/User');
const { replicate } = require('../config/replicate');
const fs = require('fs-extra');
const path = require('path');
const fetch = require('node-fetch');
const archiver = require('archiver');

/**
 * Download images from URLs and create a ZIP file
 */
async function createZipFromUrls(imageUrls, outputPath) {
  const tempDir = path.join(__dirname, '../../temp-images');
  await fs.ensureDir(tempDir);

  console.log(`📥 Downloading ${imageUrls.length} images...`);

  // Download all images
  const downloadPromises = imageUrls.map(async (url, index) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
      }
      const buffer = await response.buffer();
      const ext = path.extname(new URL(url).pathname) || '.jpg';
      const filename = `image_${index + 1}${ext}`;
      const filepath = path.join(tempDir, filename);
      await fs.writeFile(filepath, buffer);
      console.log(`  ✅ Downloaded: ${filename}`);
      return filepath;
    } catch (error) {
      console.error(`  ❌ Failed to download image ${index + 1}:`, error.message);
      throw error;
    }
  });

  const downloadedFiles = await Promise.all(downloadPromises);

  // Create ZIP file
  console.log('📦 Creating ZIP file...');
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', async () => {
      console.log(`✅ ZIP created: ${archive.pointer()} bytes`);
      // Cleanup temp directory
      await fs.remove(tempDir);
      resolve(outputPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add all downloaded files to ZIP
    downloadedFiles.forEach((filepath) => {
      archive.file(filepath, { name: path.basename(filepath) });
    });

    archive.finalize();
  });
}

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
  try {
    const uploadedZip = req.file;
    const { userId } = req.body;
    const imageUrls = Array.isArray(req.body.imageUrls) ? req.body.imageUrls : [];
    const modelName = req.body.modelName;
    const trainingConfig = req.body.trainingConfig && typeof req.body.trainingConfig === 'object'
      ? req.body.trainingConfig
      : {};
    const hasZipUpload = Boolean(uploadedZip);

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Validate image URLs
    if (!hasZipUpload && imageUrls.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Provide at least one image URL or upload a ZIP file',
      });
    }

    if (hasZipUpload) {
      const extension = path.extname(uploadedZip.originalname || '').toLowerCase();
      if (extension !== '.zip') {
        return res.status(400).json({
          success: false,
          message: 'Uploaded file must be a ZIP archive',
        });
      }
    }

    // Recommend at least 10 images for better results
    if (!hasZipUpload && imageUrls.length < 10) {
      console.log(`⚠️  Warning: Only ${imageUrls.length} images provided. Replicate recommends at least 10 images for best results.`);
    }

    // Create unique model name with timestamp
    const timestamp = Date.now();
    const baseModelName = (modelName || user.name.toLowerCase()).replace(/[^a-z0-9-]/g, '-');
    const uniqueModelName = `${baseModelName}-${timestamp}`;

    // Create ZIP file from image URLs (store permanently)
    const zipsDir = path.join(__dirname, '../../training-zips');
    await fs.ensureDir(zipsDir);
    const zipPath = path.join(zipsDir, `${uniqueModelName}.zip`);

    if (hasZipUpload) {
      console.log('📦 Using uploaded ZIP file for training images');
      await fs.writeFile(zipPath, uploadedZip.buffer);
      console.log(`✅ Uploaded ZIP saved: ${zipPath} (${uploadedZip.size} bytes)`);
    } else {
      console.log('🎯 Creating ZIP file from image URLs...');
      console.log(`📁 ZIP will be saved to: ${zipPath}`);
      await createZipFromUrls(imageUrls, zipPath);
    }

    // Read the ZIP file as a buffer for Replicate
    console.log('📤 Reading ZIP file for upload...');
    const zipBuffer = await fs.readFile(zipPath);
    console.log(`✅ ZIP file read: ${zipBuffer.length} bytes`);

    // Upload ZIP file to Replicate Files API to get URL
    console.log('🌐 Uploading ZIP to Replicate Files API...');
    const uploadedFile = await replicate.files.create(zipBuffer);
    const zipUrl = uploadedFile.urls.get;
    console.log(`✅ ZIP uploaded to Replicate: ${zipUrl}`);

    // Use same trigger word as model name for consistency
    const triggerWord = baseModelName;

    // Prepare training input for Replicate
    const trainingInput = {
      input_images: zipUrl, // Use URL from Files API
      steps: trainingConfig?.steps ? Number(trainingConfig.steps) : 1000,
      lora_rank: trainingConfig?.loraRank ? Number(trainingConfig.loraRank) : 16,
      batch_size: trainingConfig?.batchSize ? Number(trainingConfig.batchSize) : 1,
      learning_rate: trainingConfig?.learningRate ? Number(trainingConfig.learningRate) : 0.0004,
      trigger_word: triggerWord,
    };

    console.log('🚀 Starting training with Replicate...');
    console.log('Training Config:', {
      steps: trainingInput.steps,
      lora_rank: trainingInput.lora_rank,
      batch_size: trainingInput.batch_size,
      learning_rate: trainingInput.learning_rate,
      trigger_word: trainingInput.trigger_word,
    });

    // Prepare training configuration
    const trainingOptions = {
      input: trainingInput,
    };

    // Add destination if REPLICATE_USERNAME is configured
    if (process.env.REPLICATE_USERNAME) {
      const destinationPath = `${process.env.REPLICATE_USERNAME}/${uniqueModelName}`;
      trainingOptions.destination = destinationPath;
      console.log('📦 Destination:', destinationPath);
      console.log('🔤 Trigger word:', triggerWord);

      // Try to create the model first with unique name (allows multiple trainings)
      try {
        console.log('🔨 Creating new model on Replicate...');
        await replicate.models.create(
          process.env.REPLICATE_USERNAME,
          uniqueModelName,
          {
            visibility: 'private',
            hardware: 'gpu-t4',
            description: `Fine-tuned Flux model for ${user.name} (trigger: ${triggerWord})`,
          }
        );
        console.log('✅ Model created successfully');
      } catch (modelError) {
        console.error('❌ Model creation failed:', modelError.message);
        // If model creation fails, throw error to prevent training
        throw new Error(`Failed to create model: ${modelError.message}`);
      }
    } else {
      console.log('⚠️  No REPLICATE_USERNAME set - training will not be saved to account');
    }

    // Start training on Replicate
    const training = await replicate.trainings.create(
      'ostris',
      'flux-dev-lora-trainer',
      'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      trainingOptions
    );

    console.log('✅ Training started:', training.id);
    console.log(`💾 ZIP file saved permanently at: ${zipPath}`);

    // Save training to database
    const newTraining = await Training.create({
      userId,
      replicateTrainingId: training.id,
      modelName: uniqueModelName,
      imageUrls,
      status: training.status,
      logsUrl: training.logs,
      trainingConfig: {
        steps: trainingInput.steps,
        learningRate: trainingInput.learning_rate,
        batchSize: trainingInput.batch_size,
        triggerWord: triggerWord,
        zipPath: zipPath,
        source: hasZipUpload ? 'upload' : 'urls',
        originalZipName: hasZipUpload ? uploadedZip.originalname : null,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Training started successfully',
      data: newTraining,
    });
  } catch (error) {
    console.error('❌ Error starting training:', error);
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
