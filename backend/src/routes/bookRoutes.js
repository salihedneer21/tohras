const express = require('express');
const multer = require('multer');
const bookController = require('../controllers/bookController');
const { validateBookCreate, validateBookUpdate } = require('../middleware/validators');
const storybookAutomationController = require('../controllers/storybookAutomationController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB per image
  },
});

const uploadFields = upload.fields([
  { name: 'coverImage', maxCount: 1 },
  { name: 'pageImages', maxCount: 100 },
]);

const storybookUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB per background
  },
});

const storybookFields = storybookUpload.fields([{ name: 'characterImages', maxCount: 100 }]);

router.get('/', bookController.getAllBooks);
router.get('/storybooks/stream/live', storybookAutomationController.streamJobs);
router.get('/:id/storybooks', bookController.getBookStorybooks);
router.get('/:id/storybooks/jobs', storybookAutomationController.listJobs);
router.get('/:id/storybooks/jobs/:jobId', storybookAutomationController.getJob);
router.post('/:id/storybooks', storybookFields, bookController.generateStorybook);
router.post('/:id/storybooks/auto', storybookAutomationController.startAutomation);
router.get('/:id/storybooks/:assetId/pages', bookController.getStorybookAssetPages);
router.post(
  '/:id/storybooks/:assetId/pages/:pageOrder/regenerate',
  bookController.regenerateStorybookPage
);
router.post('/:id/storybooks/:assetId/regenerate', bookController.regenerateStorybookPdf);
router.post(
  '/:id/storybooks/:assetId/pages/:pageOrder/select',
  bookController.selectStorybookPageCandidate
);
router.get('/:id', bookController.getBookById);
router.post('/', uploadFields, validateBookCreate, bookController.createBook);
router.put('/:id', uploadFields, validateBookUpdate, bookController.updateBook);
router.delete('/:id', bookController.deleteBook);
router.patch('/:id/status', bookController.updateBookStatus);

module.exports = router;
