const express = require('express');
const router = express.Router();
const multer = require('multer');
const trainingController = require('../controllers/trainingController');
const { validateTraining } = require('../middleware/validators');

// Configure multer to buffer uploads in memory for further processing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit for training ZIP uploads
  },
});

const normalizeTrainingPayload = (req, res, next) => {
  try {
    if (typeof req.body.imageUrls === 'string') {
      const trimmed = req.body.imageUrls.trim();
      req.body.imageUrls = trimmed ? JSON.parse(trimmed) : [];
    }
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: 'Image URLs must be provided as a JSON array',
      error: error.message,
    });
  }

  if (!Array.isArray(req.body.imageUrls)) {
    req.body.imageUrls = [];
  }

  try {
    if (typeof req.body.trainingConfig === 'string') {
      const trimmed = req.body.trainingConfig.trim();
      req.body.trainingConfig = trimmed ? JSON.parse(trimmed) : {};
    }
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: 'Training config must be a valid JSON object',
      error: error.message,
    });
  }

  if (!req.body.trainingConfig || typeof req.body.trainingConfig !== 'object') {
    req.body.trainingConfig = {};
  }

  next();
};

/**
 * @route   GET /api/trainings
 * @desc    Get all training jobs
 * @access  Public
 */
router.get('/', trainingController.getAllTrainings);

/**
 * @route   GET /api/trainings/:id
 * @desc    Get training by ID
 * @access  Public
 */
router.get('/:id', trainingController.getTrainingById);

/**
 * @route   POST /api/trainings
 * @desc    Start new training
 * @access  Public
 */
router.post(
  '/',
  upload.single('trainingZip'),
  normalizeTrainingPayload,
  validateTraining,
  trainingController.startTraining
);

/**
 * @route   GET /api/trainings/:id/status
 * @desc    Check training status
 * @access  Public
 */
router.get('/:id/status', trainingController.checkTrainingStatus);

/**
 * @route   POST /api/trainings/:id/cancel
 * @desc    Cancel training
 * @access  Public
 */
router.post('/:id/cancel', trainingController.cancelTraining);

/**
 * @route   GET /api/trainings/user/:userId/successful
 * @desc    Get successful trainings for a user
 * @access  Public
 */
router.get('/user/:userId/successful', trainingController.getUserSuccessfulTrainings);

module.exports = router;
