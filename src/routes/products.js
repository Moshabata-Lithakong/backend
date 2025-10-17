const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');
const {
  getAllProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getVendorProducts,
  searchProducts,
  getProductStats,
} = require('../controllers/productController');

const router = express.Router();

// Public routes
router.get('/', getAllProducts);
router.get('/search', searchProducts);
router.get('/:id', getProduct);

// Protect all routes after this middleware
router.use(protect);

router.get('/vendor/my-products', restrictTo('vendor'), getVendorProducts);
router.get('/stats/stats', restrictTo('admin'), getProductStats);

router.post('/', restrictTo('vendor'), uploadMultiple('images'), createProduct);
router.patch('/:id', restrictTo('vendor'), uploadMultiple('images'), updateProduct);
router.delete('/:id', restrictTo('vendor'), deleteProduct);

module.exports = router;