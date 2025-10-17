const Order = require('../models/Order');
const User = require('../models/users');
const Product = require('../models/product');
const Interview = require('../models/interview');

class AnalyticsService {
  async getDashboardStats() {
    try {
      const [
        totalUsers,
        totalVendors,
        totalDrivers,
        totalProducts,
        totalOrders,
        totalRevenue,
        pendingOrders,
        completedOrdersToday
      ] = await Promise.all([
        User.countDocuments({ isActive: true }),
        User.countDocuments({ role: 'vendor', isActive: true }),
        User.countDocuments({ role: 'taxi_driver', isActive: true }),
        Product.countDocuments({ available: true }),
        Order.countDocuments(),
        Order.aggregate([
          { $match: { status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]),
        Order.countDocuments({ status: 'pending' }),
        Order.countDocuments({ 
          status: 'completed',
          createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
        })
      ]);

      return {
        totalUsers,
        totalVendors,
        totalDrivers,
        totalProducts,
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        pendingOrders,
        completedOrdersToday
      };
    } catch (error) {
      throw new Error(`Error fetching dashboard stats: ${error.message}`);
    }
  }

  async getSalesAnalytics(timeRange = '30d') {
    try {
      let dateFilter = {};
      const now = new Date();

      switch (timeRange) {
        case '7d':
          dateFilter = { createdAt: { $gte: new Date(now.setDate(now.getDate() - 7)) } };
          break;
        case '30d':
          dateFilter = { createdAt: { $gte: new Date(now.setDate(now.getDate() - 30)) } };
          break;
        case '90d':
          dateFilter = { createdAt: { $gte: new Date(now.setDate(now.getDate() - 90)) } };
          break;
        case '1y':
          dateFilter = { createdAt: { $gte: new Date(now.setFullYear(now.getFullYear() - 1)) } };
          break;
      }

      const salesData = await Order.aggregate([
        { $match: { ...dateFilter, status: 'completed' } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$totalAmount' },
            orders: { $sum: 1 },
            averageOrderValue: { $avg: '$totalAmount' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const categorySales = await Order.aggregate([
        { $match: { ...dateFilter, status: 'completed' } },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.productId',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $group: {
            _id: '$product.category',
            revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
            quantitySold: { $sum: '$items.quantity' }
          }
        },
        { $sort: { revenue: -1 } }
      ]);

      return {
        salesData,
        categorySales
      };
    } catch (error) {
      throw new Error(`Error fetching sales analytics: ${error.message}`);
    }
  }

  async getUserAnalytics() {
    try {
      const userGrowth = await User.aggregate([
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const roleDistribution = await User.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 }
          }
        }
      ]);

      const userActivity = await User.aggregate([
        {
          $project: {
            lastLogin: 1,
            isActive: {
              $cond: {
                if: { $gte: ['$lastLogin', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] },
                then: 'active',
                else: 'inactive'
              }
            }
          }
        },
        {
          $group: {
            _id: '$isActive',
            count: { $sum: 1 }
          }
        }
      ]);

      return {
        userGrowth,
        roleDistribution,
        userActivity
      };
    } catch (error) {
      throw new Error(`Error fetching user analytics: ${error.message}`);
    }
  }

  async generateReport(type, format = 'json') {
    try {
      let reportData;

      switch (type) {
        case 'sales':
          reportData = await this.getSalesAnalytics('90d');
          break;
        case 'users':
          reportData = await this.getUserAnalytics();
          break;
        case 'products':
          reportData = await this.getProductAnalytics();
          break;
        case 'interviews':
          reportData = await this.getInterviewAnalytics();
          break;
        default:
          throw new Error('Invalid report type');
      }

      if (format === 'csv') {
        return this._convertToCSV(reportData);
      }

      return reportData;
    } catch (error) {
      throw new Error(`Error generating report: ${error.message}`);
    }
  }

  async getProductAnalytics() {
    try {
      const productStats = await Product.aggregate([
        {
          $group: {
            _id: '$category',
            totalProducts: { $sum: 1 },
            availableProducts: { $sum: { $cond: ['$available', 1, 0] } },
            avgPrice: { $avg: '$price' },
            totalStock: { $sum: '$stockQuantity' }
          }
        }
      ]);

      const topProducts = await Order.aggregate([
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            totalSold: { $sum: '$items.quantity' },
            totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
          }
        },
        { $sort: { totalSold: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' }
      ]);

      return {
        productStats,
        topProducts
      };
    } catch (error) {
      throw new Error(`Error fetching product analytics: ${error.message}`);
    }
  }

  async getInterviewAnalytics() {
    try {
      const interviewStats = await Interview.aggregate([
        {
          $group: {
            _id: null,
            totalInterviews: { $sum: 1 },
            publicInterviews: { $sum: { $cond: ['$isPublic', 1, 0] } },
            avgTranscriptLength: { $avg: { $strLenCP: '$transcript' } }
          }
        }
      ]);

      const tagAnalysis = await Interview.aggregate([
        { $unwind: '$tags' },
        {
          $group: {
            _id: '$tags',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]);

      const themeAnalysis = await Interview.aggregate([
        { $unwind: '$themes' },
        {
          $group: {
            _id: '$themes',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]);

      return {
        overview: interviewStats[0] || {},
        tagAnalysis,
        themeAnalysis
      };
    } catch (error) {
      throw new Error(`Error fetching interview analytics: ${error.message}`);
    }
  }

  _convertToCSV(data) {
    // Simple CSV conversion implementation
    // This would need to be expanded based on specific data structure
    const headers = Object.keys(data);
    const rows = [headers.join(',')];
    
    // Add data rows based on structure
    // This is a simplified version - actual implementation would depend on data structure
    
    return rows.join('\n');
  }
}

module.exports = new AnalyticsService();