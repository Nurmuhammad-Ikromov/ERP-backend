'use strict';

const AppError = require('../utils/AppError');

/**
 * Usage: authorize('admin') or authorize('admin', 'seller')
 * Must be called AFTER authenticate middleware.
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(new AppError('Authentication required', 401));
  if (!roles.includes(req.user.role)) {
    return next(new AppError('You do not have permission to perform this action', 403));
  }
  next();
};

module.exports = { authorize };
