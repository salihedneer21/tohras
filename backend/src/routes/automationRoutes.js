const express = require('express');
const multer = require('multer');
const automationController = require('../controllers/automationController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 40,
  },
});

router.get('/', automationController.listRuns);
router.get('/stream/live', automationController.streamRuns);
router.get('/:id', automationController.getRun);
router.post('/', upload.array('images'), automationController.startAutomation);

module.exports = router;
