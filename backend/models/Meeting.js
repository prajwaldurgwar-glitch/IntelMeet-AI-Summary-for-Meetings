const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  userId: {
    type: String,
  },
  username: {
    type: String,
    required: true,
  },
  message: {
    type: String, // not required — file/poll messages don't use this field
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  type: {
    type: String,
    enum: ['text', 'system', 'file', 'poll'],
    default: 'text',
  },
}, { strict: false }); // allow extra fields (fileUrl, fileName, question, options, etc.)

const transcriptSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  isFinal: {
    type: Boolean,
    default: true,
  },
  timestamp: {
    type: String,
    required: true,
  },
});

const activitySchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  timestamp: {
    type: String,
    required: true,
  },
});

const participantSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
  leftAt: {
    type: Date,
  },
});

const meetingSchema = new mongoose.Schema({
  meetingId: {
    type: String,
    required: true,
    unique: true,
  },
  title: {
    type: String,
    default: 'Untitled Meeting',
  },
  host: {
    userId: String,
    username: String,
  },
  participants: [participantSchema],
  messages: [messageSchema],
  transcript: [transcriptSchema],  // Speech-to-text conversations
  activities: [activitySchema],     // Join/leave, hand raise, screen share events
  startTime: {
    type: Date,
    default: Date.now,
  },
  endTime: {
    type: Date,
  },
  endedAt: {
    type: Date,
  },
  status: {
    type: String,
    enum: ['active', 'ended'],
    default: 'active',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  summary: {
    type: String,
  },
  duration: {
    type: Number, // in minutes
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
  },
});

// TTL Index - MongoDB will automatically delete documents 24 hours after expiresAt
meetingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Calculate duration before saving
meetingSchema.pre('save', function(next) {
  if (this.endTime && this.startTime) {
    this.duration = Math.round((this.endTime - this.startTime) / 60000); // Convert to minutes
  }
  next();
});

module.exports = mongoose.model('Meeting', meetingSchema);
