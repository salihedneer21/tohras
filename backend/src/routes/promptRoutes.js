const express = require('express');
const multer = require('multer');
const promptController = require('../controllers/promptController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per image
  },
});

router.post('/generate', upload.array('images', 10), promptController.generatePrompts);

module.exports = router;
