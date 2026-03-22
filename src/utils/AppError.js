'use strict';

/**
 * Operational errors that we anticipate and can send back to the client.
 * Programmer errors (bugs) should NOT use this — let them bubble as 500.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode >= 400 && statusCode < 500 ? 'fail' : 'error';
    this.isOperational = true;
    this.details = details; // optional array of validation errors or extra info
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
