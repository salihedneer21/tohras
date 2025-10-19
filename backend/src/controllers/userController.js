const User = require('../models/User');
const { validationResult } = require('express-validator');
const { uploadBufferToS3, deleteFromS3, generateImageKey } = require('../config/s3');
const { evaluateSingleImage } = require('../services/evaluator');

const parseBoolean = (value) =>
  typeof value === 'string' ? value === 'true' || value === '1' : Boolean(value);

/**
 * Get all users
 * @route GET /api/users
 */
exports.getAllUsers = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};

    const users = await User.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message,
    });
  }
};

/**
 * Get single user by ID
 * @route GET /api/users/:id
 */
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error.message,
    });
  }
};

/**
 * Create new user
 * @route POST /api/users
 */
exports.createUser = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { name, age, gender, email, countryCode, phoneNumber } = req.body;

    const user = await User.create({
      name,
      age,
      gender,
      email,
      countryCode,
      phoneNumber,
      imageAssets: [],
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user,
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message,
    });
  }
};

/**
 * Update user
 * @route PUT /api/users/:id
 */
exports.updateUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { name, age, gender, email, countryCode, phoneNumber, status } = req.body;

    // Check if user exists
    let user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Update user fields
    user = await User.findByIdAndUpdate(
      req.params.id,
      {
        name,
        age,
        gender,
        email,
        countryCode,
        phoneNumber,
        status,
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user,
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message,
    });
  }
};

/**
 * Delete user
 * @route DELETE /api/users/:id
 */
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (Array.isArray(user.imageAssets) && user.imageAssets.length > 0) {
      await Promise.all(
        user.imageAssets.map((asset) =>
          deleteFromS3(asset.key).catch((err) =>
            console.warn('⚠️  Failed to delete image from S3 during user removal:', err.message)
          )
        )
      );
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      data: {},
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message,
    });
  }
};

/**
 * Upload user image asset
 * @route POST /api/users/:id/images/upload
 */
exports.uploadImageAsset = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an image file',
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const override = parseBoolean(req.body.override);
    const base64 = req.file.buffer.toString('base64');

    let evaluation = null;
    let imageEvaluation = null;

    try {
      evaluation = await evaluateSingleImage({
        name: req.file.originalname,
        mimeType: req.file.mimetype,
        base64,
      });
      imageEvaluation = Array.isArray(evaluation?.images) ? evaluation.images[0] : null;
    } catch (error) {
      const statusCode = error.statusCode || error.status || 500;
      return res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to evaluate image',
        error: error.details || undefined,
      });
    }

    if (!override && (!imageEvaluation || !imageEvaluation.acceptable)) {
      return res.status(422).json({
        success: false,
        message: 'Image rejected by evaluator',
        evaluation,
        data: imageEvaluation,
      });
    }

    const key = generateImageKey(user._id, req.file.originalname);
    const { url } = await uploadBufferToS3(req.file.buffer, key, req.file.mimetype);

    const asset = {
      key,
      url,
      size: req.file.size,
      contentType: req.file.mimetype,
      uploadedAt: new Date(),
      originalName: req.file.originalname,
      evaluation: imageEvaluation
        ? {
            verdict: imageEvaluation.verdict,
            acceptable: Boolean(imageEvaluation.acceptable),
            scorePercent: imageEvaluation.overallScorePercent ?? null,
            confidencePercent: imageEvaluation.confidencePercent ?? null,
            summary: evaluation?.overallAcceptance?.summary || '',
            override,
          }
        : {
            override,
          },
    };

    user.imageAssets.push(asset);
    await user.save();

    res.status(200).json({
      success: true,
      message:
        override && !imageEvaluation?.acceptable
          ? 'Image uploaded with override'
          : 'Image uploaded successfully',
      data: {
        asset,
        evaluation,
      },
    });
  } catch (error) {
    console.error('Error uploading image asset:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message,
    });
  }
};

/**
 * Remove user image asset
 * @route DELETE /api/users/:id/images/:assetId
 */
exports.removeImageAsset = async (req, res) => {
  try {
    const { assetId } = req.params;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const asset = user.imageAssets.id(assetId);
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Image not found for this user',
      });
    }

    const { deleteFromS3 } = require('../config/s3');
    await deleteFromS3(asset.key);

    user.removeImageAsset(assetId);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Image removed successfully',
      data: user.imageAssets,
    });
  } catch (error) {
    console.error('Error removing image asset:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove image',
      error: error.message,
    });
  }
};
