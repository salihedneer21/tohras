const User = require('../models/User');
const { validationResult } = require('express-validator');

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

    const { name, age, gender, email, countryCode, phoneNumber, imageUrls } = req.body;

    // Check if user with email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    const user = await User.create({
      name,
      age,
      gender,
      email,
      countryCode,
      phoneNumber,
      imageUrls: imageUrls || [],
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

    const { name, age, gender, email, countryCode, phoneNumber, imageUrls, status } = req.body;

    // Check if user exists
    let user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use by another user',
        });
      }
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
        imageUrls,
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
 * Add image URLs to user
 * @route POST /api/users/:id/images
 */
exports.addImageUrls = async (req, res) => {
  try {
    const { imageUrls } = req.body;

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of image URLs',
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Add new URLs to existing ones
    user.imageUrls = [...new Set([...user.imageUrls, ...imageUrls])];
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Image URLs added successfully',
      data: user,
    });
  } catch (error) {
    console.error('Error adding image URLs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add image URLs',
      error: error.message,
    });
  }
};

/**
 * Remove image URL from user
 * @route DELETE /api/users/:id/images
 */
exports.removeImageUrl = async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an image URL to remove',
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    user.imageUrls = user.imageUrls.filter((url) => url !== imageUrl);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Image URL removed successfully',
      data: user,
    });
  } catch (error) {
    console.error('Error removing image URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove image URL',
      error: error.message,
    });
  }
};
