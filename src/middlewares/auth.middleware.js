'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { JWT_SECRET } = require('../config/env');

/**
 * Verifies the JWT from Authorization header or cookie.
 * Attaches req.user on success.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  let token;

  // Bearer token in Authorization header (preferred)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) throw new AppError('Authentication required', 401);

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new AppError('Invalid or expired token', 401);
  }

  const user = await User.findById(decoded.id).select('-passwordHash');
  if (!user || !user.isActive) throw new AppError('User not found or deactivated', 401);

  req.user = user;
  next();
});

module.exports = { authenticate };
