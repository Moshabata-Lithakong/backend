const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const APIFeatures = require('../utils/apiFeatures');

// ADD THIS MISSING FUNCTION - Driver assigned deliveries
exports.getDriverAssignedDeliveries = catchAsync(async (req, res, next) => {
  const driverId = req.user.id;
  
  const query = { 
    taxiDriverId: new mongoose.Types.ObjectId(driverId),
    status: { $in: ['delivering', 'ready', 'confirmed'] }
  };

  const features = new APIFeatures(Order.find(query), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const orders = await features.query
    .populate('passengerId', 'profile')
    .populate('vendorId', 'profile vendorInfo')
    .select('+pickupLocation +destination +deliveryFee +payment +items');

  res.status(200).json({
    status: 'success',
    results: orders.length,
    data: {
      orders,
    },
  });
});

// FIXED: Get available delivery orders for drivers
exports.getAvailableDeliveryOrders = catchAsync(async (req, res, next) => {
  const query = { 
    status: { $in: ['ready', 'confirmed'] }, 
    taxiDriverId: null 
  };

  const features = new APIFeatures(Order.find(query), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const orders = await features.query
    .populate('passengerId', 'profile')
    .populate('vendorId', 'profile vendorInfo')
    .select('+pickupLocation +destination +deliveryFee +payment +items');

  res.status(200).json({
    status: 'success',
    results: orders.length,
    data: {
      orders,
    },
  });
});

// FIXED: Get driver earnings
exports.getDriverEarnings = catchAsync(async (req, res, next) => {
  const driverId = req.user.id;
  
  // Calculate total earnings from completed deliveries
  const earnings = await Order.aggregate([
    {
      $match: {
        taxiDriverId: new mongoose.Types.ObjectId(driverId),
        status: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: '$deliveryFee' },
        totalDeliveries: { $sum: 1 },
        averageEarning: { $avg: '$deliveryFee' }
      }
    }
  ]);

  // Get recent deliveries for breakdown
  const recentDeliveries = await Order.find({
    taxiDriverId: driverId,
    status: 'completed'
  })
  .select('deliveryFee createdAt status pickupLocation destination')
  .sort({ createdAt: -1 })
  .limit(10);

  const result = earnings.length > 0 ? earnings[0] : {
    totalEarnings: 0,
    totalDeliveries: 0,
    averageEarning: 0
  };

  res.status(200).json({
    status: 'success',
    data: {
      earnings: result,
      recentDeliveries,
      currency: 'LSL'
    }
  });
});

// FIXED: Update order status with proper permission checks
exports.updateOrderStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  const orderId = req.params.id;
  const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivering', 'completed', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return next(new AppError('Invalid status value', 400));
  }

  const order = await Order.findById(orderId);

  if (!order) {
    return next(new AppError('No order found with that ID', 404));
  }

  // FIXED: Enhanced authorization check - allow passengers to cancel their own orders
  const isAdmin = req.user.role === 'admin';
  const isVendor = order.vendorId && order.vendorId.toString() === req.user.id;
  const isDriver = order.taxiDriverId && order.taxiDriverId.toString() === req.user.id;
  const isPassenger = order.passengerId && order.passengerId.toString() === req.user.id;

  // Allow passengers to cancel only their own orders with status 'pending' or 'confirmed'
  if (status === 'cancelled' && isPassenger) {
    if (order.status !== 'pending' && order.status !== 'confirmed') {
      return next(new AppError('You can only cancel orders that are pending or confirmed', 400));
    }
  }
  // For other status updates, check standard permissions
  else if (!isAdmin && !isVendor && !isDriver && !isPassenger) {
    return next(new AppError('You do not have permission to update this order', 403));
  }

  // Status transition validation
  const statusFlow = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: ['delivering', 'cancelled'],
    delivering: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  };

  if (!statusFlow[order.status]?.includes(status)) {
    return next(new AppError(`Invalid status transition from ${order.status} to ${status}`, 400));
  }

  // Handle cancellation - restore product stock
  if (status === 'cancelled' && order.status !== 'cancelled') {
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        product.stockQuantity += item.quantity;
        await product.save();
      }
    }
    
    // Set cancellation details
    order.cancelledAt = new Date();
    order.cancelledBy = req.user.id;
  }

  order.status = status;

  // Set timestamps for certain status changes
  if (status === 'delivering') {
    order.estimatedDelivery = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
    order.pickupConfirmedAt = new Date();
  } else if (status === 'completed') {
    order.actualDelivery = new Date();
    order.deliveryConfirmedAt = new Date();
  }

  await order.save();

  const updatedOrder = await Order.findById(order._id)
    .populate('passengerId', 'profile')
    .populate('vendorId', 'profile vendorInfo')
    .populate('taxiDriverId', 'profile taxiDriverInfo');

  // Emit real-time status update
  const io = req.app.get('io');
  if (io) {
    io.to(`order_${order._id}`).emit('order_updated', updatedOrder);
    
    // Notify specific users based on role
    if (isPassenger && status === 'cancelled') {
      io.to(`vendor_${order.vendorId}`).emit('order_cancelled', updatedOrder);
    } else if (isVendor && status === 'ready') {
      io.to(`driver_*`).emit('new_delivery_available', updatedOrder);
    }
  }

  res.status(200).json({
    status: 'success',
    data: {
      order: updatedOrder,
    },
  });
});

// FIXED: Accept delivery assignment
exports.acceptDelivery = catchAsync(async (req, res, next) => {
  const orderId = req.params.id;
  const driverId = req.user.id;

  const order = await Order.findById(orderId);

  if (!order) {
    return next(new AppError('No order found with that ID', 404));
  }

  // Check if order is available for delivery
  if (order.status !== 'ready' && order.status !== 'confirmed') {
    return next(new AppError('Order is not available for delivery', 400));
  }

  if (order.taxiDriverId && order.taxiDriverId.toString() !== driverId) {
    return next(new AppError('Order already assigned to another driver', 400));
  }

  // Assign driver to order
  order.taxiDriverId = driverId;
  order.status = 'delivering';
  order.driverAssignedAt = new Date();
  order.estimatedDelivery = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  await order.save();

  const updatedOrder = await Order.findById(order._id)
    .populate('passengerId', 'profile')
    .populate('vendorId', 'profile vendorInfo')
    .populate('taxiDriverId', 'profile taxiDriverInfo');

  // Emit real-time notification
  const io = req.app.get('io');
  if (io) {
    io.to(`vendor_${order.vendorId}`).emit('driver_assigned', updatedOrder);
    io.to(`passenger_${order.passengerId}`).emit('driver_assigned', updatedOrder);
  }

  res.status(200).json({
    status: 'success',
    message: 'Delivery assignment accepted successfully',
    data: {
      order: updatedOrder,
    },
  });
});

// FIXED: Complete delivery
exports.completeDelivery = catchAsync(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new AppError('No order found with that ID', 404));
  }

  if (order.taxiDriverId?.toString() !== req.user.id) {
    return next(new AppError('You are not assigned to this order', 403));
  }

  if (order.status !== 'delivering') {
    return next(new AppError('Order is not in delivering state', 400));
  }

  order.status = 'completed';
  order.actualDelivery = new Date();
  order.deliveryConfirmedAt = new Date();

  await order.save();

  const updatedOrder = await Order.findById(order._id)
    .populate('passengerId', 'profile')
    .populate('vendorId', 'profile vendorInfo')
    .populate('taxiDriverId', 'profile taxiDriverInfo');

  // Notify passenger and vendor
  const io = req.app.get('io');
  if (io) {
    io.to(`order_${order._id}`).emit('order_updated', updatedOrder);
    io.to(`passenger_${order.passengerId}`).emit('delivery_completed', updatedOrder);
    io.to(`vendor_${order.vendorId}`).emit('delivery_completed', updatedOrder);
  }

  res.status(200).json({
    status: 'success',
    data: {
      order: updatedOrder,
    },
  });
});

// Keep all your existing functions
exports.getAllOrders = catchAsync(async (req, res, next) => {
  const features = new APIFeatures(Order.find(), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const orders = await features.query
    .populate('passengerId', 'profile')
    .populate('vendorId', 'profile vendorInfo')
    .populate('taxiDriverId', 'profile taxiDriverInfo');

  res.status(200).json({
    status: 'success',
    results: orders.length,
    data: {
      orders,
    },
  });
});

exports.getOrder = catchAsync(async (req, res, next) => {
  const order = await Order.findById(req.params.id)
    .populate('passengerId', 'profile')
    .populate('vendorId', 'profile vendorInfo')
    .populate('taxiDriverId', 'profile taxiDriverInfo')
    .populate('items.productId');

  if (!order) {
    return next(new AppError('No order found with that ID', 404));
  }

  // Check if user is authorized to view this order
  if (
    req.user.role !== 'admin' &&
    order.passengerId._id.toString() !== req.user.id &&
    order.vendorId._id.toString() !== req.user.id &&
    (order.taxiDriverId && order.taxiDriverId._id.toString() !== req.user.id)
  ) {
    return next(new AppError('You are not authorized to view this order', 403));
  }

  res.status(200).json({
    status: 'success',
    data: {
      order,
    },
  });
});

exports.createOrder = catchAsync(async (req, res, next) => {
  const { items, pickupLocation, destination, payment, notes, isUrgent } = req.body;

  // Validate required fields
  if (!items || !Array.isArray(items) || items.length === 0) {
    return next(new AppError('At least one item is required', 400));
  }
  if (!pickupLocation || !pickupLocation.address || !pickupLocation.coordinates) {
    return next(new AppError('Pickup location with address and coordinates is required', 400));
  }
  if (!destination || !destination.address || !destination.coordinates) {
    return next(new AppError('Destination with address and coordinates is required', 400));
  }
  if (!payment || !payment.method) {
    return next(new AppError('Payment method is required', 400));
  }
  if (['mpesa', 'ecocash'].includes(payment.method) && !payment.phoneNumber) {
    return next(new AppError('Phone number is required for M-Pesa or EcoCash', 400));
  }

  // Validate items and calculate total
  let totalAmount = 0;
  const orderItems = [];
  let vendorId = null;

  for (const item of items) {
    const product = await Product.findById(item.productId);

    if (!product) {
      return next(new AppError(`Product with ID ${item.productId} not found`, 404));
    }

    if (!product.available || product.stockQuantity < item.quantity) {
      return next(new AppError(`Product ${product.name.en} is not available in the requested quantity`, 400));
    }

    // Ensure all items are from the same vendor
    if (!vendorId) {
      vendorId = product.vendorId;
    } else if (vendorId.toString() !== product.vendorId.toString()) {
      return next(new AppError('All items must be from the same vendor', 400));
    }

    totalAmount += product.price * item.quantity;

    orderItems.push({
      productId: product._id,
      productName: {
        en: product.name.en,
        st: product.name.st,
      },
      quantity: item.quantity,
      price: product.price,
    });

    // Update product stock
    product.stockQuantity -= item.quantity;
    await product.save();
  }

  // Calculate delivery fee
  const deliveryFee = isUrgent ? 25.0 : 15.0;
  totalAmount += deliveryFee;

  // FIXED: Use 'processing' instead of 'initiated' for mobile payments
  const paymentStatus = payment.method === 'cash' ? 'pending' : 'processing';

  const orderData = {
    passengerId: req.user.id,
    vendorId,
    items: orderItems,
    totalAmount,
    deliveryFee,
    isUrgent: isUrgent || false,
    pickupLocation: {
      address: pickupLocation.address,
      coordinates: {
        latitude: pickupLocation.coordinates.latitude,
        longitude: pickupLocation.coordinates.longitude,
      },
      vendorName: pickupLocation.vendorName,
      vendorPhone: pickupLocation.vendorPhone,
    },
    destination: {
      address: destination.address,
      coordinates: {
        latitude: destination.coordinates.latitude,
        longitude: destination.coordinates.longitude,
      },
      instructions: destination.instructions,
      passengerName: destination.passengerName,
      passengerPhone: destination.passengerPhone,
    },
    payment: {
      method: payment.method,
      status: paymentStatus,
      phoneNumber: payment.phoneNumber,
      amount: totalAmount,
    },
    notes,
  };

  const order = await Order.create(orderData);

  const populatedOrder = await Order.findById(order._id)
    .populate('passengerId', 'profile')
    .populate('vendorId', 'profile vendorInfo');

  // Emit real-time notification to vendor
  const io = req.app.get('io');
  if (io) {
    io.to(`vendor_${populatedOrder.vendorId._id}`).emit('new_order', populatedOrder);
  }

  res.status(201).json({
    status: 'success',
    data: {
      order: populatedOrder,
    },
  });
});

exports.createOrderWithPayment = catchAsync(async (req, res, next) => {
  console.log('🛒 createOrderWithPayment called');
  console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
  
  // Simply call the existing createOrder function since the logic is the same
  // This provides a separate endpoint for frontend compatibility
  return exports.createOrder(req, res, next);
});

exports.assignDriver = catchAsync(async (req, res, next) => {
  const { driverId } = req.body;

  if (!driverId) {
    return next(new AppError('Driver ID is required', 400));
  }

  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new AppError('No order found with that ID', 404));
  }

  if (order.vendorId.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new AppError('You are not authorized to assign a driver to this order', 403));
  }

  if (order.status !== 'ready') {
    return next(new AppError('Order must be ready before assigning a driver', 400));
  }

  const User = require('../models/user');
  const driver = await User.findById(driverId);
  if (!driver || driver.role !== 'taxi_driver') {
    return next(new AppError('Invalid or non-driver user ID', 400));
  }

  order.taxiDriverId = driverId;
  order.status = 'delivering';
  order.driverAssignedAt = new Date();
  order.estimatedDelivery = new Date(Date.now() + 30 * 60 * 1000);

  await order.save();

  const updatedOrder = await Order.findById(order._id)
    .populate('passengerId', 'profile')
    .populate('vendorId', 'profile vendorInfo')
    .populate('taxiDriverId', 'profile taxiDriverInfo');

  // Notify driver
  const io = req.app.get('io');
  if (io) {
    io.to(`driver_${driverId}`).emit('delivery_assigned', updatedOrder);
  }

  res.status(200).json({
    status: 'success',
    data: {
      order: updatedOrder,
    },
  });
});

exports.getUserOrders = catchAsync(async (req, res, next) => {
  let query = {};

  // For passengers, show their orders
  if (req.user.role === 'passenger') {
    query = { passengerId: req.user.id };
  }
  // For vendors, show their orders
  else if (req.user.role === 'vendor') {
    query = { vendorId: req.user.id };
  }
  // For taxi drivers, show available and assigned deliveries
  else if (req.user.role === 'taxi_driver') {
    if (req.path.includes('available')) {
      query = { status: { $in: ['ready', 'confirmed'] }, taxiDriverId: null };
    } else {
      query = { taxiDriverId: req.user.id };
    }
  }
  // For admin, show all orders
  else if (req.user.role === 'admin') {
    query = {};
  }

  const features = new APIFeatures(Order.find(query), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const orders = await features.query
    .populate('passengerId', 'profile')
    .populate('vendorId', 'profile vendorInfo')
    .populate('taxiDriverId', 'profile taxiDriverInfo');

  res.status(200).json({
    status: 'success',
    results: orders.length,
    data: {
      orders,
    },
  });
});

exports.getOrderStats = catchAsync(async (req, res, next) => {
  const stats = await Order.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(new Date().setDate(new Date().getDate() - 30)),
        },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
        totalRevenue: { $sum: '$totalAmount' },
        avgOrderValue: { $avg: '$totalAmount' },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  const statusStats = await Order.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  const totalOrders = await Order.countDocuments();
  const revenueToday = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        status: 'completed',
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$totalAmount' },
      },
    },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      dailyStats: stats,
      statusStats,
      totalOrders,
      revenueToday: revenueToday.length > 0 ? revenueToday[0].total : 0,
    },
  });
});