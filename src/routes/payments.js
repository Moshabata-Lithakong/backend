const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const {
  initiateMpesaPayment,
  initiateEcocashPayment,
  handleMpesaCallback,
  handleEcocashCallback,
  getPaymentStatus,
  confirmPayment,
} = require('../controllers/paymentsController');

const router = express.Router();

// Protect all routes except callbacks
router.use(protect);

// Input validation for payment initiation
const paymentValidation = [
  body('orderId').isMongoId().withMessage('Invalid order ID'),
  body('phoneNumber').matches(/^\+266\d{8}$/).withMessage('Invalid Lesotho phone number'),
];

// M-Pesa endpoints
router.post('/mpesa/initiate', restrictTo('passenger'), paymentValidation, (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: 'error', message: errors.array() });
  }
  initiateMpesaPayment(req, res, next);
});

// EcoCash endpoints  
router.post('/ecocash/initiate', restrictTo('passenger'), paymentValidation, (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: 'error', message: errors.array() });
  }
  initiateEcocashPayment(req, res, next);
});

// Payment status and confirmation endpoints
router.get('/status/:orderId', getPaymentStatus);
router.post('/confirm', confirmPayment); // For manual testing

// Payment callbacks (public endpoints for payment providers)
router.post('/mpesa/callback', handleMpesaCallback);
router.post('/ecocash/callback', handleEcocashCallback);

module.exports = router;