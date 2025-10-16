const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { validateUser } = require('../middleware/validators');

/**
 * @route   GET /api/users
 * @desc    Get all users
 * @access  Public
 */
router.get('/', userController.getAllUsers);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Public
 */
router.get('/:id', userController.getUserById);

/**
 * @route   POST /api/users
 * @desc    Create new user
 * @access  Public
 */
router.post('/', validateUser, userController.createUser);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 * @access  Public
 */
router.put('/:id', validateUser, userController.updateUser);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user
 * @access  Public
 */
router.delete('/:id', userController.deleteUser);

/**
 * @route   POST /api/users/:id/images
 * @desc    Add image URLs to user
 * @access  Public
 */
router.post('/:id/images', userController.addImageUrls);

/**
 * @route   DELETE /api/users/:id/images
 * @desc    Remove image URL from user
 * @access  Public
 */
router.delete('/:id/images', userController.removeImageUrl);

module.exports = router;
