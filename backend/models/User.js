const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
  username: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    sparse: true,
  },
  joinedMeetings: [{
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meeting',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', userSchema);
