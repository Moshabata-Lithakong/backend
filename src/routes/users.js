const express = require('express');
const { protect, restrictTo, restrictToUser } = require('../middleware/auth');
const {
  getAllUsers,
  getUser,
  updateUser,
  deleteUser,
  getUserStats,
  getVendors,
  getTaxiDrivers,
} = require('../controllers/userController');

const router = express.Router();

// Protect all routes after this middleware
router.use(protect);

router.get('/stats', restrictTo('admin'), getUserStats);
router.get('/vendors', getVendors);
router.get('/drivers', getTaxiDrivers);

router.route('/')
  .get(restrictTo('admin'), getAllUsers);

router.route('/:id')
  .get(restrictToUser, getUser)
  .patch(restrictToUser, updateUser)
  .delete(restrictTo('admin'), deleteUser);

module.exports = router;