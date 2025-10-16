const express = require('express');
const router = express.Router();
const { evaluateImages } = require('../controllers/evalController');

/**
 * @route   POST /api/evals
 * @desc    Evaluate uploaded images for fine-tuning suitability
 * @access  Public
 */
router.post('/', evaluateImages);

module.exports = router;
