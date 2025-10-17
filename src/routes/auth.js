const express = require('express');
const { protect } = require('../middleware/auth');
const {
  register,
  login,
  getMe,
  updateMe,
  changePassword,
} = require('../controllers/authController');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);

// Protect all routes after this middleware
router.use(protect);

router.get('/me', getMe);
router.patch('/update-me', updateMe);
router.patch('/change-password', changePassword);

module.exports = router;