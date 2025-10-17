const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const {
  getAllInterviews,
  getInterview,
  createInterview,
  updateInterview,
  deleteInterview,
  searchInterviews,
  addTagsToInterview,
  addThemesToInterview,
  getInterviewStats,
} = require('../controllers/interviewController');

const router = express.Router();

// Public routes (only public interviews)
router.get('/', getAllInterviews);
router.get('/search', searchInterviews);
router.get('/:id', getInterview);

// Protect all routes after this middleware
router.use(protect);

router.get('/stats/stats', restrictTo('admin'), getInterviewStats);

router.post('/', restrictTo('admin'), createInterview);
router.patch('/:id/tags', restrictTo('admin'), addTagsToInterview);
router.patch('/:id/themes', restrictTo('admin'), addThemesToInterview);

router.route('/:id')
  .patch(restrictTo('admin'), updateInterview)
  .delete(restrictTo('admin'), deleteInterview);

module.exports = router;