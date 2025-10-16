const { body } = require('express-validator');

/**
 * Validation rules for user creation/update
 */
exports.validateUser = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),

  body('age')
    .notEmpty()
    .withMessage('Age is required')
    .isInt({ min: 1, max: 150 })
    .withMessage('Age must be between 1 and 150'),

  body('gender')
    .notEmpty()
    .withMessage('Gender is required')
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be male, female, or other'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('countryCode')
    .trim()
    .notEmpty()
    .withMessage('Country code is required')
    .matches(/^\+\d{1,4}$/)
    .withMessage('Country code must be in format +XX'),

  body('phoneNumber')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^\d{6,15}$/)
    .withMessage('Phone number must be 6-15 digits'),

  body('imageUrls')
    .optional()
    .isArray()
    .withMessage('Image URLs must be an array'),

  body('imageUrls.*')
    .optional()
    .isURL()
    .withMessage('Each image URL must be a valid URL'),
];

/**
 * Validation rules for training
 */
exports.validateTraining = [
  body('userId').notEmpty().withMessage('User ID is required').isMongoId().withMessage('Invalid user ID'),

  body('imageUrls')
    .custom((value, { req }) => {
      if (!Array.isArray(value)) {
        throw new Error('Image URLs must be provided as an array');
      }

      const hasZipUpload = !!req.file;
      if (value.length === 0 && !hasZipUpload) {
        throw new Error('Provide at least one image URL or upload a ZIP file');
      }

      return true;
    }),

  body('imageUrls.*')
    .optional()
    .isURL()
    .withMessage('Each image URL must be a valid URL'),

  body('modelName')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Model name must be between 3 and 50 characters'),

  body('trainingConfig.steps')
    .optional()
    .isInt({ min: 100, max: 5000 })
    .withMessage('Training steps must be between 100 and 5000'),

  body('trainingConfig.learningRate')
    .optional()
    .isFloat({ min: 0.00001, max: 0.01 })
    .withMessage('Learning rate must be between 0.00001 and 0.01'),

  body('trainingConfig.batchSize')
    .optional()
    .isInt({ min: 1, max: 16 })
    .withMessage('Batch size must be between 1 and 16'),
];

/**
 * Validation rules for image generation
 */
exports.validateGeneration = [
  body('userId').notEmpty().withMessage('User ID is required').isMongoId().withMessage('Invalid user ID'),

  body('trainingId')
    .notEmpty()
    .withMessage('Training ID is required')
    .isMongoId()
    .withMessage('Invalid training ID'),

  body('prompt')
    .trim()
    .notEmpty()
    .withMessage('Prompt is required')
    .isLength({ min: 3, max: 1000 })
    .withMessage('Prompt must be between 3 and 1000 characters'),

  body('config.numOutputs')
    .optional()
    .isInt({ min: 1, max: 4 })
    .withMessage('Number of outputs must be between 1 and 4'),

  body('config.guidanceScale')
    .optional()
    .isFloat({ min: 0, max: 10 })
    .withMessage('Guidance scale must be between 0 and 10'),

  body('config.outputQuality')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Output quality must be between 0 and 100'),

  body('config.promptStrength')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Prompt strength must be between 0 and 1'),
];
