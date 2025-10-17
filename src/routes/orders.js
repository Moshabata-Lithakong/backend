const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const {
  getAllOrders,
  getOrder,
  createOrder,
  createOrderWithPayment,
  updateOrderStatus,
  assignDriver,
  getUserOrders,
  getOrderStats,
  acceptDelivery,
  completeDelivery,
  getDriverEarnings,
  getAvailableDeliveryOrders,
  getDriverAssignedDeliveries, // ADD THIS IMPORT
} = require('../controllers/orderController');

const router = express.Router();

// Protect all routes after this middleware
router.use(protect);

// Input validation for order creation
const createOrderValidation = [
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId').isMongoId().withMessage('Invalid product ID'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('pickupLocation.address').notEmpty().withMessage('Pickup address is required'),
  body('pickupLocation.coordinates.latitude').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('pickupLocation.coordinates.longitude').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  body('destination.address').notEmpty().withMessage('Destination address is required'),
  body('destination.coordinates.latitude').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('destination.coordinates.longitude').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  body('payment.method').isIn(['cash', 'mpesa', 'ecocash']).withMessage('Invalid payment method'),
  body('payment.phoneNumber')
    .if(body('payment.method').isIn(['mpesa', 'ecocash']))
    .notEmpty()
    .withMessage('Phone number is required for M-Pesa or EcoCash'),
];

// FIXED: Driver-specific routes - ADD THE MISSING ASSIGNED DELIVERIES ENDPOINT
router.get('/driver/available', restrictTo('taxi_driver'), getAvailableDeliveryOrders);
router.get('/driver/earnings', restrictTo('taxi_driver'), getDriverEarnings);
router.get('/driver/assigned', restrictTo('taxi_driver'), getDriverAssignedDeliveries); // ADD THIS LINE
router.patch('/driver/:id/accept', restrictTo('taxi_driver'), acceptDelivery);
router.patch('/driver/:id/complete', restrictTo('taxi_driver'), completeDelivery);

// User-specific orders - FIX PERMISSIONS FOR PASSENGER ORDER CANCELLATION
router.get('/my-orders', getUserOrders); // For passengers
router.get('/vendor/my-orders', restrictTo('vendor'), getUserOrders);
router.get('/stats', restrictTo('admin'), getOrderStats);

// Order management
router
  .route('/')
  .get(restrictTo('admin'), getAllOrders)
  .post(restrictTo('passenger'), createOrderValidation, (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', message: errors.array() });
    }
    createOrder(req, res, next);
  });

// FIXED: Add create-with-payment endpoint for frontend compatibility
router.post('/create-with-payment', restrictTo('passenger'), createOrderValidation, (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: 'error', message: errors.array() });
  }
  createOrderWithPayment(req, res, next);
});

router.route('/:id').get(getOrder);

// FIXED: Allow passengers to cancel their own orders
router.patch('/:id/status', updateOrderStatus); // REMOVE restrictTo to handle permissions in controller

router.patch('/:id/assign-driver', restrictTo('vendor', 'admin'), assignDriver);

module.exports = router;