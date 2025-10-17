const Interview = require('../models/interview');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const APIFeatures = require('../utils/apiFeatures');

exports.getAllInterviews = catchAsync(async (req, res, next) => {
  let query = {};

  // Non-admin users can only see public interviews
  if (req.user.role !== 'admin') {
    query.isPublic = true;
  }

  const features = new APIFeatures(Interview.find(query), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const interviews = await features.query.populate('uploadedBy', 'profile');

  res.status(200).json({
    status: 'success',
    results: interviews.length,
    data: {
      interviews,
    },
  });
});

exports.getInterview = catchAsync(async (req, res, next) => {
  let query = { _id: req.params.id };

  // Non-admin users can only see public interviews
  if (req.user.role !== 'admin') {
    query.isPublic = true;
  }

  const interview = await Interview.findOne(query).populate('uploadedBy', 'profile');

  if (!interview) {
    return next(new AppError('No interview found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      interview,
    },
  });
});

exports.createInterview = catchAsync(async (req, res, next) => {
  const { title, transcript, interviewee, dateConducted, location, tags, themes, isPublic } = req.body;

  const interview = await Interview.create({
    title,
    transcript,
    interviewee,
    dateConducted,
    location,
    tags: tags || [],
    themes: themes || [],
    isPublic: isPublic || false,
    uploadedBy: req.user.id,
  });

  const populatedInterview = await Interview.findById(interview._id)
    .populate('uploadedBy', 'profile');

  res.status(201).json({
    status: 'success',
    data: {
      interview: populatedInterview,
    },
  });
});

exports.updateInterview = catchAsync(async (req, res, next) => {
  const interview = await Interview.findById(req.params.id);

  if (!interview) {
    return next(new AppError('No interview found with that ID', 404));
  }

  // Check if user is authorized to update (admin or uploader)
  if (req.user.role !== 'admin' && interview.uploadedBy.toString() !== req.user.id) {
    return next(new AppError('You are not authorized to update this interview', 403));
  }

  const updatedInterview = await Interview.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
      runValidators: true,
    }
  ).populate('uploadedBy', 'profile');

  res.status(200).json({
    status: 'success',
    data: {
      interview: updatedInterview,
    },
  });
});

exports.deleteInterview = catchAsync(async (req, res, next) => {
  const interview = await Interview.findById(req.params.id);

  if (!interview) {
    return next(new AppError('No interview found with that ID', 404));
  }

  // Check if user is authorized to delete (admin or uploader)
  if (req.user.role !== 'admin' && interview.uploadedBy.toString() !== req.user.id) {
    return next(new AppError('You are not authorized to delete this interview', 403));
  }

  await Interview.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.searchInterviews = catchAsync(async (req, res, next) => {
  const { q, tags, themes, dateFrom, dateTo } = req.query;

  let query = {};

  // Non-admin users can only see public interviews
  if (req.user.role !== 'admin') {
    query.isPublic = true;
  }

  // Text search
  if (q) {
    query.$text = { $search: q };
  }

  // Tags filter
  if (tags) {
    query.tags = { $in: tags.split(',') };
  }

  // Themes filter
  if (themes) {
    query.themes = { $in: themes.split(',') };
  }

  // Date range filter
  if (dateFrom || dateTo) {
    query.dateConducted = {};
    if (dateFrom) query.dateConducted.$gte = new Date(dateFrom);
    if (dateTo) query.dateConducted.$lte = new Date(dateTo);
  }

  const features = new APIFeatures(Interview.find(query), req.query)
    .sort()
    .limitFields()
    .paginate();

  const interviews = await features.query.populate('uploadedBy', 'profile');

  res.status(200).json({
    status: 'success',
    results: interviews.length,
    data: {
      interviews,
    },
  });
});

exports.addTagsToInterview = catchAsync(async (req, res, next) => {
  const { tags } = req.body;

  if (!tags || !Array.isArray(tags)) {
    return next(new AppError('Tags must be provided as an array', 400));
  }

  const interview = await Interview.findById(req.params.id);

  if (!interview) {
    return next(new AppError('No interview found with that ID', 404));
  }

  // Check if user is authorized to update (admin or uploader)
  if (req.user.role !== 'admin' && interview.uploadedBy.toString() !== req.user.id) {
    return next(new AppError('You are not authorized to update this interview', 403));
  }

  // Add new tags, avoid duplicates
  const newTags = [...new Set([...interview.tags, ...tags])];
  interview.tags = newTags;
  await interview.save();

  res.status(200).json({
    status: 'success',
    data: {
      interview,
    },
  });
});

exports.addThemesToInterview = catchAsync(async (req, res, next) => {
  const { themes } = req.body;

  if (!themes || !Array.isArray(themes)) {
    return next(new AppError('Themes must be provided as an array', 400));
  }

  const interview = await Interview.findById(req.params.id);

  if (!interview) {
    return next(new AppError('No interview found with that ID', 404));
  }

  // Check if user is authorized to update (admin or uploader)
  if (req.user.role !== 'admin' && interview.uploadedBy.toString() !== req.user.id) {
    return next(new AppError('You are not authorized to update this interview', 403));
  }

  // Add new themes, avoid duplicates
  const newThemes = [...new Set([...interview.themes, ...themes])];
  interview.themes = newThemes;
  await interview.save();

  res.status(200).json({
    status: 'success',
    data: {
      interview,
    },
  });
});

exports.getInterviewStats = catchAsync(async (req, res, next) => {
  const stats = await Interview.aggregate([
    {
      $group: {
        _id: null,
        totalInterviews: { $sum: 1 },
        publicInterviews: { $sum: { $cond: ['$isPublic', 1, 0] } },
        avgTranscriptLength: { $avg: { $strLenCP: '$transcript' } },
        totalTags: { $sum: { $size: '$tags' } },
        totalThemes: { $sum: { $size: '$themes' } }
      }
    }
  ]);

  const tagStats = await Interview.aggregate([
    { $unwind: '$tags' },
    {
      $group: {
        _id: '$tags',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  const themeStats = await Interview.aggregate([
    { $unwind: '$themes' },
    {
      $group: {
        _id: '$themes',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      overview: stats[0] || {
        totalInterviews: 0,
        publicInterviews: 0,
        avgTranscriptLength: 0,
        totalTags: 0,
        totalThemes: 0
      },
      popularTags: tagStats,
      popularThemes: themeStats,
    },
  });
});