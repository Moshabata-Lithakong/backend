const express = require('express');
const { protect, authorize } = require('../../middleware/auth');
const {
  getAvailableOrders,
  acceptOrder,
  rejectOrder,
  startDelivery,
  completeDelivery,
  getDriverAssignedOrders,
  getDriverEarnings
} = require('../../controllers/driverOrdersController');

const router = express.Router();

router.use(protect);
router.use(authorize('taxi_driver'));

// Driver order management
router.get('/available', getAvailableOrders);
router.get('/assigned', getDriverAssignedOrders);
router.patch('/:orderId/accept', acceptOrder);
router.patch('/:orderId/reject', rejectOrder);
router.patch('/:orderId/start', startDelivery);
router.patch('/:orderId/complete', completeDelivery);
router.get('/earnings', getDriverEarnings);

module.exports = router;