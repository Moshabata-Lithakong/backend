const express = require('express');
const { protect, authorize } = require('../../middleware/auth');
const {
  getDriverEarnings,
  getEarningsSummary,
  getEarningsByPeriod,
  requestPayout
} = require('../../controllers/driverEarningsController');

const router = express.Router();

router.use(protect);
router.use(authorize('taxi_driver'));

// Driver earnings endpoints
router.get('/', getDriverEarnings);
router.get('/summary', getEarningsSummary);
router.get('/period', getEarningsByPeriod);
router.post('/payout', requestPayout);

module.exports = router;