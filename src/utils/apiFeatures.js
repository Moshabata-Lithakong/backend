const AppError = require('./appError');

class APIFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
  }

  filter() {
    const queryObj = { ...this.queryString };
    const excludedFields = ['page', 'sort', 'limit', 'fields', 'search'];
    excludedFields.forEach((el) => delete queryObj[el]);

    // Advanced filtering
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt|eq|ne)\b/g, (match) => `$${match}`);

    try {
      this.query = this.query.find(JSON.parse(queryStr));
    } catch (error) {
      throw new AppError('Invalid filter query parameters', 400);
    }

    return this;
  }

  sort() {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' ');
      // Validate sort fields to prevent injection
      const validSortFields = ['createdAt', 'updatedAt', 'price', 'totalAmount', 'priority', 'status'];
      const sortFields = sortBy.split(' ').map((field) => field.replace(/^-/, ''));
      if (!sortFields.every((field) => validSortFields.includes(field))) {
        throw new AppError('Invalid sort fields', 400);
      }
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort('-createdAt');
    }

    return this;
  }

  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',').join(' ');
      // Validate fields to prevent injection
      const validFields = [
        'passengerId',
        'vendorId',
        'taxiDriverId',
        'items',
        'status',
        'totalAmount',
        'deliveryFee',
        'isUrgent',
        'pickupLocation',
        'destination',
        'payment',
        'notes',
        'estimatedDelivery',
        'actualDelivery',
        'createdAt',
        'updatedAt',
        'name',
        'description',
        'category',
        'price',
        'currency',
        'images',
        'tags',
        'available',
        'stockQuantity',
        'priority',
        'ratings',
      ];
      const selectedFields = fields.split(' ').map((field) => field.replace(/^-/, ''));
      if (!selectedFields.every((field) => validFields.includes(field))) {
        throw new AppError('Invalid field selection', 400);
      }
      this.query = this.query.select(fields);
    } else {
      this.query = this.query.select('-__v');
    }

    return this;
  }

  paginate() {
    const page = parseInt(this.queryString.page, 10) || 1;
    const limit = parseInt(this.queryString.limit, 10) || 100;
    if (page < 1 || limit < 1) {
      throw new AppError('Page and limit must be positive integers', 400);
    }

    const skip = (page - 1) * limit;
    this.query = this.query.skip(skip).limit(limit);

    return this;
  }

  async count() {
    const total = await this.query.model.countDocuments(this.query.getQuery());
    return total;
  }

  search() {
    if (this.queryString.search) {
      const searchTerm = this.queryString.search;
      this.query = this.query.find({
        $text: { $search: searchTerm },
      });
    }
    return this;
  }
}

module.exports = APIFeatures;