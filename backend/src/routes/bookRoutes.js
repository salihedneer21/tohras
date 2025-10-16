const express = require('express');
const multer = require('multer');
const bookController = require('../controllers/bookController');
const { validateBookCreate, validateBookUpdate } = require('../middleware/validators');

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

router.get('/', bookController.getAllBooks);
router.get('/:id', bookController.getBookById);
router.post('/', uploadFields, validateBookCreate, bookController.createBook);
router.put('/:id', uploadFields, validateBookUpdate, bookController.updateBook);
router.delete('/:id', bookController.deleteBook);
router.patch('/:id/status', bookController.updateBookStatus);

module.exports = router;
