'use strict';

/**
 * Wraps an async route handler so unhandled promise rejections are
 * forwarded to Express's next(err) without needing try/catch in every controller.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
