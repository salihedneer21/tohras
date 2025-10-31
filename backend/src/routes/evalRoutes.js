const express = require('express');
const router = express.Router();
const {
  evaluateImages,
  listEvaluations,
  updateEvaluationTags,
  updateEvaluationDecision,
  deleteEvaluation,
} = require('../controllers/evalController');

router.get('/', listEvaluations);
router.post('/', evaluateImages);
router.patch('/:id/tags', updateEvaluationTags);
router.patch('/:id/decision', updateEvaluationDecision);
router.delete('/:id', deleteEvaluation);

module.exports = router;
