const Product = require('../models/Product');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const APIFeatures = require('../utils/apiFeatures');
const cloudinary = require('../config/cloudinary');

exports.getAllProducts = catchAsync(async (req, res, next) => {
  const features = new APIFeatures(Product.find({ available: true }), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const products = await features.query.populate({
    path: 'vendorId',
    select: 'profile email vendorInfo'
  });

  res.status(200).json({
    status: 'success',
    results: products.length,
    data: {
      products,
    },
  });
});

exports.getProduct = catchAsync(async (req, res, next) => {
  const product = await Product.findById(req.params.id).populate({
    path: 'vendorId',
    select: 'profile email vendorInfo'
  });

  if (!product) {
    return next(new AppError('No product found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      product,
    },
  });
});

exports.createProduct = catchAsync(async (req, res, next) => {
  console.log('Creating product for user:', req.user.id);
  console.log('Request body:', req.body);

  // Add vendorId to the request body
  req.body.vendorId = req.user.id;

  // Handle image uploads
  if (req.files && req.files.length > 0) {
    const imageUploads = req.files.map(async (file) => {
      const result = await cloudinary.uploadToCloudinary(file.buffer, 'products');
      return {
        url: result.secure_url,
        publicId: result.public_id,
      };
    });

    req.body.images = await Promise.all(imageUploads);
  }

  // Ensure product is available by default
  req.body.available = true;

  const product = await Product.create(req.body);
  
  // Populate the vendor info before sending response
  const populatedProduct = await Product.findById(product._id).populate({
    path: 'vendorId',
    select: 'profile email vendorInfo'
  });
  
  console.log('Product created successfully:', populatedProduct._id);

  res.status(201).json({
    status: 'success',
    data: {
      product: populatedProduct,
    },
  });
});

exports.updateProduct = catchAsync(async (req, res, next) => {
  // Check if product exists and user owns it
  const product = await Product.findOne({ _id: req.params.id, vendorId: req.user.id });

  if (!product) {
    return next(new AppError('No product found with that ID or you are not authorized to update it', 404));
  }

  // Handle image uploads if new images are provided
  if (req.files && req.files.length > 0) {
    // Delete old images from Cloudinary
    if (product.images.length > 0) {
      const deletePromises = product.images.map(async (image) => {
        await cloudinary.deleteFromCloudinary(image.publicId);
      });
      await Promise.all(deletePromises);
    }

    // Upload new images
    const imageUploads = req.files.map(async (file) => {
      const result = await cloudinary.uploadToCloudinary(file.buffer, 'products');
      return {
        url: result.secure_url,
        publicId: result.public_id,
      };
    });

    req.body.images = await Promise.all(imageUploads);
  }

  const updatedProduct = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  }).populate({
    path: 'vendorId',
    select: 'profile email vendorInfo'
  });

  res.status(200).json({
    status: 'success',
    data: {
      product: updatedProduct,
    },
  });
});

exports.deleteProduct = catchAsync(async (req, res, next) => {
  const product = await Product.findOne({ _id: req.params.id, vendorId: req.user.id });

  if (!product) {
    return next(new AppError('No product found with that ID or you are not authorized to delete it', 404));
  }

  // Delete images from Cloudinary
  if (product.images.length > 0) {
    const deletePromises = product.images.map(async (image) => {
      await cloudinary.deleteFromCloudinary(image.publicId);
    });
    await Promise.all(deletePromises);
  }

  await Product.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.getVendorProducts = catchAsync(async (req, res, next) => {
  console.log('Getting products for vendor:', req.user.id);
  
  const features = new APIFeatures(
    Product.find({ vendorId: req.user.id }),
    req.query
  )
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const products = await features.query;

  console.log(`Found ${products.length} products for vendor`);

  res.status(200).json({
    status: 'success',
    results: products.length,
    data: {
      products,
    },
  });
});

exports.searchProducts = catchAsync(async (req, res, next) => {
  const { q, category, minPrice, maxPrice, vendor } = req.query;

  let query = { available: true };

  // Text search
  if (q) {
    query.$or = [
      { 'name.en': { $regex: q, $options: 'i' } },
      { 'name.st': { $regex: q, $options: 'i' } },
      { 'description.en': { $regex: q, $options: 'i' } },
      { 'description.st': { $regex: q, $options: 'i' } }
    ];
  }

  // Category filter
  if (category && category !== 'all') {
    query.category = category;
  }

  // Price range filter
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = parseFloat(minPrice);
    if (maxPrice) query.price.$lte = parseFloat(maxPrice);
  }

  // Vendor filter
  if (vendor) {
    query.vendorId = vendor;
  }

  const features = new APIFeatures(Product.find(query), req.query)
    .sort()
    .limitFields()
    .paginate();

  const products = await features.query.populate({
    path: 'vendorId',
    select: 'profile email vendorInfo'
  });

  res.status(200).json({
    status: 'success',
    results: products.length,
    data: {
      products,
    },
  });
});

exports.getProductStats = catchAsync(async (req, res, next) => {
  const stats = await Product.aggregate([
    {
      $match: { available: true }
    },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        avgPrice: { $avg: '$price' },
        maxPrice: { $max: '$price' },
        minPrice: { $min: '$price' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);

  const totalProducts = await Product.countDocuments({ available: true });
  const outOfStock = await Product.countDocuments({ stockQuantity: 0 });

  res.status(200).json({
    status: 'success',
    data: {
      stats,
      totalProducts,
      outOfStock,
    },
  });
});