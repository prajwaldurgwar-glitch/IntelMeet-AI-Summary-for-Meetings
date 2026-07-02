const mongoose = require('mongoose');
require('dotenv').config();

// Production-ready: Always use environment variables for credentials
// Set MONGODB_URI in your .env file or deployment platform's environment settings
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is not set!');
  console.error('Please set MONGODB_URI in your .env file or deployment platform.');
  process.exit(1);
}

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ MongoDB connected successfully');
    }
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
