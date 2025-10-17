const Order = require('../models/Order');
const Payment = require('../models/payments');
const DriverEarnings = require('../models/driverEarnings');
const mongoose = require('mongoose');

// Enhanced M-Pesa payment initiation
exports.initiateMpesaPayment = async (req, res, next) => {
  try {
    const { orderId, phoneNumber } = req.body;
    const userId = req.user._id;

    console.log(`💳 Initiating M-Pesa payment for order: ${orderId}, user: ${userId}`);

    // Validate order exists and user is authorized
    const order = await Order.findOne({ _id: orderId, passengerId: userId })
      .populate('passengerId', 'profile')
      .populate('vendorId', 'profile vendorInfo');

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found or you are not authorized',
      });
    }

    // Check if payment is already processing or completed
    if (order.payment.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: `Payment already ${order.payment.status}`,
      });
    }

    const amount = order.totalAmount;

    // Check if payment record already exists
    let payment = await Payment.findOne({ orderId });
    
    if (!payment) {
      // Create new payment record
      payment = await Payment.create({
        orderId,
        passengerId: userId,
        vendorId: order.vendorId,
        amount,
        paymentMethod: 'mpesa',
        phoneNumber,
        status: 'processing',
        reference: `MPESA_${Date.now()}_${orderId}`
      });
    } else {
      // Update existing payment record
      payment.status = 'processing';
      payment.phoneNumber = phoneNumber;
      payment.reference = `MPESA_${Date.now()}_${orderId}`;
      await payment.save();
    }

    // Enhanced simulation with proper error handling
    try {
      // Simulate M-Pesa API call with timeout
      const mpesaResponse = await new Promise((resolve, reject) => {
        setTimeout(() => {
          // Simulate 90% success rate for testing
          if (Math.random() > 0.1) {
            resolve({
              status: 'success',
              transactionId: `MPESA_${Date.now()}`,
              message: 'Payment initiated successfully. Please check your phone to complete the payment.',
              checkoutRequestID: `ws_CO_${Date.now()}`,
              responseCode: '0',
              responseDescription: 'Success'
            });
          } else {
            reject(new Error('Simulated M-Pesa API failure'));
          }
        }, 1500);
      });

      if (mpesaResponse.status === 'success') {
        // Update order payment status
        order.payment.status = 'processing';
        order.payment.transactionId = mpesaResponse.transactionId || payment.reference;
        order.payment.phoneNumber = phoneNumber;
        await order.save();

        // Update payment record with transaction ID
        payment.reference = mpesaResponse.transactionId || payment.reference;
        await payment.save();

        console.log(`✅ M-Pesa payment initiated for order: ${orderId}`);

        return res.status(200).json({
          status: 'success',
          message: 'M-Pesa payment initiated successfully',
          data: { 
            order: {
              _id: order._id,
              status: order.status,
              totalAmount: order.totalAmount,
              payment: order.payment
            },
            payment: {
              _id: payment._id,
              status: payment.status,
              reference: payment.reference,
              amount: payment.amount,
              paymentMethod: payment.paymentMethod
            },
            mpesaResponse: {
              transactionId: mpesaResponse.transactionId,
              message: mpesaResponse.message
            }
          },
        });
      }
    } catch (apiError) {
      console.error('❌ M-Pesa API simulation error:', apiError);
      
      // Mark payment as failed
      payment.status = 'failed';
      payment.failureReason = apiError.message;
      await payment.save();

      order.payment.status = 'failed';
      await order.save();

      return res.status(400).json({
        status: 'error',
        message: 'Failed to initiate M-Pesa payment. Please try again.',
        error: apiError.message
      });
    }
  } catch (error) {
    console.error('❌ M-Pesa initiation error:', error);
    return res.status(500).json({
      status: 'error',
      message: `Error initiating M-Pesa payment: ${error.message}`,
    });
  }
};

// EcoCash payment initiation
exports.initiateEcocashPayment = async (req, res, next) => {
  try {
    const { orderId, phoneNumber } = req.body;
    const userId = req.user._id;

    console.log(`💳 Initiating EcoCash payment for order: ${orderId}`);

    // Validate order exists and user is authorized
    const order = await Order.findOne({ _id: orderId, passengerId: userId });
    
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found or you are not authorized',
      });
    }

    // Check if payment is already processing or completed
    if (order.payment.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: `Payment already ${order.payment.status}`,
      });
    }

    const amount = order.totalAmount;

    // Create payment record
    const payment = await Payment.create({
      orderId,
      passengerId: userId,
      vendorId: order.vendorId,
      amount,
      paymentMethod: 'ecocash',
      phoneNumber,
      status: 'processing',
      reference: `ECOCASH_${Date.now()}_${orderId}`
    });

    // Simulate EcoCash API call
    const ecoCashResponse = await new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          status: 'success',
          transactionId: `ECOCASH_${Date.now()}`,
          message: 'EcoCash payment initiated. Please check your phone.',
        });
      }, 1500);
    });

    // Update order payment status
    order.payment.status = 'processing';
    order.payment.transactionId = ecoCashResponse.transactionId;
    order.payment.phoneNumber = phoneNumber;
    await order.save();

    return res.status(200).json({
      status: 'success',
      message: 'EcoCash payment initiated successfully',
      data: {
        order: {
          _id: order._id,
          status: order.status,
          totalAmount: order.totalAmount,
          payment: order.payment
        },
        payment: {
          _id: payment._id,
          status: payment.status,
          reference: payment.reference
        }
      }
    });

  } catch (error) {
    console.error('❌ EcoCash initiation error:', error);
    return res.status(500).json({
      status: 'error',
      message: `Error initiating EcoCash payment: ${error.message}`,
    });
  }
};

// Enhanced payment confirmation with driver earnings
exports.confirmPayment = async (req, res, next) => {
  try {
    const { orderId, status, transactionId } = req.body;

    const order = await Order.findById(orderId)
      .populate('passengerId', 'profile')
      .populate('vendorId', 'profile vendorInfo')
      .populate('taxiDriverId', 'profile taxiDriverInfo');

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    // Find or create payment record
    let payment = await Payment.findOne({ orderId });
    if (!payment) {
      payment = await Payment.create({
        orderId,
        passengerId: order.passengerId,
        vendorId: order.vendorId,
        amount: order.totalAmount,
        paymentMethod: order.payment.method,
        phoneNumber: order.payment.phoneNumber,
        status: status,
        reference: transactionId || `MANUAL_${Date.now()}`
      });
    }

    order.payment.status = status;
    if (status === 'completed') {
      order.payment.paymentDate = new Date();
      order.payment.transactionId = transactionId || payment.reference;
      
      // Update order status if it's pending
      if (order.status === 'pending') {
        order.status = 'confirmed';
      }
      
      // Update payment record
      payment.status = 'completed';
      payment.completedAt = new Date();
      payment.reference = transactionId || payment.reference;
      await payment.save();

      // Create driver earnings record if driver is assigned and delivery completed
      if (order.taxiDriverId && order.status === 'completed') {
        await DriverEarnings.create({
          driverId: order.taxiDriverId,
          orderId: order._id,
          deliveryFee: order.deliveryFee,
          commission: order.deliveryFee * 0.1, // 10% platform commission
          driverAmount: order.deliveryFee * 0.9, // 90% to driver
          currency: 'LSL',
          status: 'pending', // Will be paid out later
          paymentMethod: 'mpesa'
        });
      }
    } else if (status === 'failed') {
      payment.status = 'failed';
      payment.failureReason = req.body.failureReason || 'Payment failed';
      await payment.save();
    }

    await order.save();

    return res.status(200).json({
      status: 'success',
      message: `Payment ${status} successfully`,
      data: { 
        order,
        payment 
      }
    });
  } catch (error) {
    console.error('❌ Payment confirmation error:', error);
    return res.status(500).json({
      status: 'error',
      message: `Error confirming payment: ${error.message}`,
    });
  }
};

// Payment status check
exports.getPaymentStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const payment = await Payment.findOne({ orderId });
    const order = await Order.findById(orderId);

    if (!payment || !order) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment or order not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: {
        paymentStatus: payment.status,
        orderPaymentStatus: order.payment.status,
        orderStatus: order.status,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        reference: payment.reference
      }
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: `Error getting payment status: ${error.message}`,
    });
  }
};

// M-Pesa callback handler
exports.handleMpesaCallback = async (req, res, next) => {
  try {
    const callbackData = req.body;
    console.log('📱 M-Pesa callback received:', callbackData);

    // Process M-Pesa callback (simplified)
    // In real implementation, you would validate the callback and update payment status
    
    res.status(200).json({
      status: 'success',
      message: 'Callback received'
    });
  } catch (error) {
    console.error('❌ M-Pesa callback error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error processing callback'
    });
  }
};

// EcoCash callback handler  
exports.handleEcocashCallback = async (req, res, next) => {
  try {
    const callbackData = req.body;
    console.log('📱 EcoCash callback received:', callbackData);

    // Process EcoCash callback
    
    res.status(200).json({
      status: 'success',
      message: 'Callback received'
    });
  } catch (error) {
    console.error('❌ EcoCash callback error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error processing callback'
    });
  }
};

// Get payment details
exports.getPaymentDetails = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const payment = await Payment.findOne({ orderId })
      .populate('passengerId', 'profile')
      .populate('vendorId', 'profile vendorInfo');

    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment not found for this order',
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: {
        payment,
        orderStatus: order.status,
        orderPaymentStatus: order.payment.status
      }
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: `Error getting payment details: ${error.message}`,
    });
  }
};

// Refund payment
exports.refundPayment = async (req, res, next) => {
  try {
    const { orderId, reason } = req.body;

    const payment = await Payment.findOne({ orderId });
    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment not found',
      });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({
        status: 'error',
        message: 'Only completed payments can be refunded',
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    // Update payment status
    payment.status = 'refunded';
    payment.failureReason = reason || 'Payment refunded';
    await payment.save();

    // Update order payment status
    order.payment.status = 'refunded';
    await order.save();

    // TODO: Implement actual refund logic with payment provider

    return res.status(200).json({
      status: 'success',
      message: 'Payment refund initiated successfully',
      data: { payment }
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: `Error refunding payment: ${error.message}`,
    });
  }
};

// Stub functions for compatibility with existing routes
exports.confirmMpesaPayment = async (req, res, next) => {
  return exports.confirmPayment(req, res, next);
};

exports.confirmEcocashPayment = async (req, res, next) => {
  return exports.confirmPayment(req, res, next);
};

exports.getMpesaPaymentStatus = async (req, res, next) => {
  return exports.getPaymentStatus(req, res, next);
};

exports.getEcocashPaymentStatus = async (req, res, next) => {
  return exports.getPaymentStatus(req, res, next);
};