const Order = require('../models/Order');
const DriverEarnings = require('../models/DriverEarnings');
const mongoose = require('mongoose');

// Get available delivery orders for drivers (orders ready for delivery)
exports.getAvailableOrders = async (req, res, next) => {
  try {
    const driverId = req.user._id;
    
    console.log(`🚕 Fetching available delivery orders for driver: ${driverId}`);

    // FIXED: Find orders that are ready for delivery
    // - Vendor has confirmed/prepared the order
    // - Payment is completed or processing  
    // - No driver assigned yet
    // - Not rejected by this driver
    const availableOrders = await Order.find({
      status: { $in: ['confirmed', 'preparing', 'ready'] },
      taxiDriverId: { $exists: false }, // FIXED: Use taxiDriverId field from your schema
      $or: [
        { rejectedDrivers: { $exists: false } },
        { rejectedDrivers: { $ne: driverId } }
      ],
      'payment.status': { $in: ['completed', 'processing', 'initiated'] }
    })
    .populate('passengerId', 'profile firstName lastName phone')
    .populate('vendorId', 'profile firstName lastName phone vendorInfo')
    .sort({ createdAt: -1 });

    console.log(`✅ Found ${availableOrders.length} available delivery orders`);

    // FIXED: Format response for delivery assignments
    const formattedOrders = availableOrders.map(order => {
      const deliveryFee = order.deliveryFee > 0 ? order.deliveryFee : (order.isUrgent ? 25 : 15);
      
      return {
        _id: order._id,
        orderNumber: `ORDER-${order._id.toString().slice(-6).toUpperCase()}`,
        passenger: {
          name: order.destination.passengerName || `${order.passengerId.profile.firstName} ${order.passengerId.profile.lastName}`,
          phone: order.destination.passengerPhone || order.passengerId.profile.phone
        },
        vendor: {
          name: order.pickupLocation.vendorName || `${order.vendorId.profile.firstName} ${order.vendorId.profile.lastName}`,
          phone: order.pickupLocation.vendorPhone || order.vendorId.profile.phone,
          location: order.pickupLocation
        },
        deliveryInfo: {
          pickupLocation: order.pickupLocation,
          destination: order.destination,
          instructions: order.destination.instructions,
          fee: deliveryFee,
          distance: calculateDistance(
            order.pickupLocation.coordinates,
            order.destination.coordinates
          ),
          isUrgent: order.isUrgent || false
        },
        items: order.items.map(item => ({
          name: item.productName.en,
          quantity: item.quantity,
          price: item.price
        })),
        orderTotal: order.totalAmount,
        status: order.status,
        paymentStatus: order.payment.status,
        createdAt: order.createdAt,
        notes: order.notes
      };
    });

    return res.status(200).json({
      status: 'success',
      results: formattedOrders.length,
      data: {
        orders: formattedOrders
      }
    });
  } catch (error) {
    console.error('Error fetching available delivery orders:', error);
    return res.status(500).json({
      status: 'error',
      message: `Error fetching available delivery orders: ${error.message}`,
    });
  }
};

// Accept a delivery assignment
exports.acceptOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const driverId = req.user._id;

    console.log(`✅ Driver ${driverId} accepting delivery assignment: ${orderId}`);

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    // Check if delivery is already assigned
    if (order.taxiDriverId && order.taxiDriverId.toString() !== driverId.toString()) {
      return res.status(400).json({
        status: 'error',
        message: 'Delivery already assigned to another driver',
      });
    }

    // Check if order is ready for delivery
    if (!['confirmed', 'preparing', 'ready'].includes(order.status)) {
      return res.status(400).json({
        status: 'error',
        message: `Order cannot be accepted for delivery in current status: ${order.status}`,
      });
    }

    // Check payment status
    if (!['completed', 'processing', 'initiated'].includes(order.payment.status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Order payment not confirmed',
      });
    }

    // FIXED: Assign driver to order for delivery
    order.taxiDriverId = driverId;
    order.status = 'delivering';
    order.driverAssignedAt = new Date();
    await order.save();

    // Calculate delivery fee
    const deliveryFee = order.deliveryFee > 0 ? order.deliveryFee : (order.isUrgent ? 25 : 15);

    // Create driver earnings record
    const driverEarning = await DriverEarnings.create({
      driverId,
      orderId,
      deliveryFee: deliveryFee,
      status: 'assigned'
    });

    console.log(`🎉 Delivery assignment accepted by driver ${driverId}`);
    console.log(`💰 Delivery fee: ${deliveryFee}`);

    // Populate the updated order for response
    const updatedOrder = await Order.findById(orderId)
      .populate('passengerId', 'profile firstName lastName phone')
      .populate('vendorId', 'profile firstName lastName phone vendorInfo')
      .populate('taxiDriverId', 'profile firstName lastName phone');

    return res.status(200).json({
      status: 'success',
      message: 'Delivery assignment accepted successfully',
      data: {
        order: updatedOrder,
        earnings: driverEarning,
        deliveryFee: deliveryFee
      }
    });
  } catch (error) {
    console.error('Error accepting delivery assignment:', error);
    return res.status(500).json({
      status: 'error',
      message: `Error accepting delivery assignment: ${error.message}`,
    });
  }
};

// Reject a delivery assignment
exports.rejectOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const driverId = req.user._id;

    console.log(`❌ Driver ${driverId} rejecting delivery assignment: ${orderId}`);

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    // Add driver to rejected list
    if (!order.rejectedDrivers) {
      order.rejectedDrivers = [];
    }
    
    if (!order.rejectedDrivers.includes(driverId)) {
      order.rejectedDrivers.push(driverId);
      await order.save();
    }

    console.log(`✅ Delivery assignment rejected by driver ${driverId}`);

    return res.status(200).json({
      status: 'success',
      message: 'Delivery assignment rejected successfully'
    });
  } catch (error) {
    console.error('Error rejecting delivery assignment:', error);
    return res.status(500).json({
      status: 'error',
      message: `Error rejecting delivery assignment: ${error.message}`,
    });
  }
};

// Start delivery (pick up from vendor)
exports.startDelivery = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const driverId = req.user._id;

    console.log(`🚀 Driver ${driverId} starting delivery: ${orderId}`);

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    // Verify driver is assigned to this delivery
    if (!order.taxiDriverId || order.taxiDriverId.toString() !== driverId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to start this delivery',
      });
    }

    order.pickupConfirmedAt = new Date();
    await order.save();

    console.log(`✅ Delivery started - order picked up from vendor`);

    return res.status(200).json({
      status: 'success',
      message: 'Delivery started successfully',
      data: {
        order
      }
    });
  } catch (error) {
    console.error('Error starting delivery:', error);
    return res.status(500).json({
      status: 'error',
      message: `Error starting delivery: ${error.message}`,
    });
  }
};

// Complete delivery
exports.completeDelivery = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const driverId = req.user._id;

    console.log(`🏁 Driver ${driverId} completing delivery: ${orderId}`);

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    // Verify driver is assigned to this delivery
    if (!order.taxiDriverId || order.taxiDriverId.toString() !== driverId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to complete this delivery',
      });
    }

    // Update order status
    order.status = 'completed';
    order.deliveryConfirmedAt = new Date();
    order.actualDelivery = new Date();
    await order.save();

    // Update driver earnings to completed
    await DriverEarnings.findOneAndUpdate(
      { orderId, driverId },
      { 
        status: 'completed',
        completedAt: new Date()
      }
    );

    const deliveryFee = order.deliveryFee > 0 ? order.deliveryFee : (order.isUrgent ? 25 : 15);
    
    console.log(`✅ Delivery completed successfully!`);
    console.log(`💰 Driver earned: ${deliveryFee}`);

    return res.status(200).json({
      status: 'success',
      message: 'Delivery completed successfully',
      data: {
        order,
        earnings: deliveryFee
      }
    });
  } catch (error) {
    console.error('Error completing delivery:', error);
    return res.status(500).json({
      status: 'error',
      message: `Error completing delivery: ${error.message}`,
    });
  }
};

// Get driver's assigned deliveries
exports.getDriverAssignedOrders = async (req, res, next) => {
  try {
    const driverId = req.user._id;

    const assignedOrders = await Order.find({
      taxiDriverId: driverId,
      status: { $in: ['delivering'] }
    })
    .populate('passengerId', 'profile firstName lastName phone')
    .populate('vendorId', 'profile firstName lastName phone vendorInfo')
    .sort({ driverAssignedAt: -1 });

    return res.status(200).json({
      status: 'success',
      results: assignedOrders.length,
      data: {
        orders: assignedOrders
      }
    });
  } catch (error) {
    console.error('Error fetching assigned deliveries:', error);
    return res.status(500).json({
      status: 'error',
      message: `Error fetching assigned deliveries: ${error.message}`,
    });
  }
};

// Get driver earnings
exports.getDriverEarnings = async (req, res, next) => {
  try {
    const driverId = req.user._id;

    const earnings = await DriverEarnings.find({ driverId })
      .populate('orderId')
      .sort({ createdAt: -1 });

    const totalEarnings = earnings
      .filter(e => e.status === 'completed')
      .reduce((sum, earning) => sum + earning.deliveryFee, 0);

    const pendingEarnings = earnings
      .filter(e => e.status === 'assigned')
      .reduce((sum, earning) => sum + earning.deliveryFee, 0);

    const completedDeliveries = earnings.filter(e => e.status === 'completed').length;
    const pendingDeliveries = earnings.filter(e => e.status === 'assigned').length;

    console.log(`💰 Driver ${driverId} earnings: LSL ${totalEarnings} from ${completedDeliveries} deliveries`);

    return res.status(200).json({
      status: 'success',
      data: {
        earnings,
        summary: {
          totalEarnings,
          pendingEarnings,
          totalDeliveries: completedDeliveries,
          pendingDeliveries: pendingDeliveries,
          averageEarningPerDelivery: completedDeliveries > 0 ? totalEarnings / completedDeliveries : 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching driver earnings:', error);
    return res.status(500).json({
      status: 'error',
      message: `Error fetching driver earnings: ${error.message}`,
    });
  }
};

// Helper function to calculate distance
function calculateDistance(coord1, coord2) {
  const R = 6371; // Earth's radius in km
  const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
  const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}