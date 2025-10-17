const mongoose = require('mongoose');

const interviewSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Interview title is required']
  },
  transcript: {
    type: String,
    required: [true, 'Transcript is required']
  },
  interviewee: {
    type: String,
    required: [true, 'Interviewee name is required']
  },
  dateConducted: {
    type: Date,
    required: [true, 'Date conducted is required']
  },
  location: {
    type: String,
    required: [true, 'Location is required']
  },
  tags: [String],
  themes: [String],
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isPublic: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for search functionality
interviewSchema.index({ title: 'text', transcript: 'text', tags: 'text' });
interviewSchema.index({ uploadedBy: 1 });
interviewSchema.index({ dateConducted: -1 });

const Interview = mongoose.model('Interview', interviewSchema);

module.exports = Interview;