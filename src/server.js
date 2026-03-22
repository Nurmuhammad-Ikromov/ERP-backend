'use strict';

const { PORT } = require('./config/env');
const { connect, disconnect } = require('./config/db');
const app = require('./app');
const logger = require('./utils/logger');

const start = async () => {
  await connect();

  const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });

  // ── Graceful shutdown ────────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await disconnect();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ── Unhandled rejections (log and exit; let process manager restart) ──
  process.on('unhandledRejection', (err) => {
    logger.error('Unhandled rejection', { message: err.message, stack: err.stack });
    server.close(() => process.exit(1));
  });
};

start();
