const express = require('express');
const router = express.Router();
const multer = require('multer');
const userController = require('../controllers/userController');
const { validateUser } = require('../middleware/validators');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per image
  },
});

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
 * @route   POST /api/users/:id/images/upload
 * @desc    Upload an image for a user
 * @access  Public
 */
router.post('/:id/images/upload', upload.single('image'), userController.uploadImageAsset);

/**
 * @route   DELETE /api/users/:id/images/:assetId
 * @desc    Delete a user image
 * @access  Public
 */
router.delete('/:id/images/:assetId', userController.removeImageAsset);

module.exports = router;
