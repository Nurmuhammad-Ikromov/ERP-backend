'use strict';

const { NODE_ENV } = require('../config/env');
const logger = require('../utils/logger');

/**
 * Centralized error handler — must be registered LAST in Express middleware chain.
 *
 * Handles:
 *  - AppError instances (operational, known errors)
 *  - Mongoose CastError (invalid ObjectId)
 *  - Mongoose ValidationError
 *  - Mongoose duplicate key (code 11000)
 *  - JWT errors
 *  - Everything else as 500
 */
const errorHandler = (err, req, res, next) => {
  let error = err;

  // ── Normalize Mongoose CastError (bad ObjectId) ────────────
  if (err.name === 'CastError') {
    error = { message: `Invalid ${err.path}: ${err.value}`, statusCode: 400, isOperational: true };
  }

  // ── Mongoose duplicate key ─────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    error = {
      message: `Duplicate value for ${field}`,
      statusCode: 409,
      isOperational: true,
    };
  }

  // ── Mongoose ValidationError ───────────────────────────────
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    error = {
      message: messages.join('. '),
      statusCode: 400,
      isOperational: true,
    };
  }

  // ── JWT errors ─────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    error = { message: 'Invalid token', statusCode: 401, isOperational: true };
  }
  if (err.name === 'TokenExpiredError') {
    error = { message: 'Token expired', statusCode: 401, isOperational: true };
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  // Log unexpected errors
  if (!error.isOperational) {
    logger.error(`[UNHANDLED ERROR] ${message}`, { stack: err.stack });
  }

  res.status(statusCode).json({
    status: statusCode >= 500 ? 'error' : 'fail',
    message,
    ...(error.details && { details: error.details }),
    ...(NODE_ENV === 'development' && !error.isOperational && { stack: err.stack }),
  });
};

module.exports = { errorHandler };
