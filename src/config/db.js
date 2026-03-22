'use strict';

const mongoose = require('mongoose');
const { MONGO_URI } = require('./env');

const connect = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      // Mongoose 8 has good defaults; explicit options kept minimal
    });
    console.log('[DB] MongoDB connected');
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    process.exit(1);
  }
};

// Graceful shutdown helper
const disconnect = async () => {
  await mongoose.disconnect();
  console.log('[DB] MongoDB disconnected');
};

module.exports = { connect, disconnect };
