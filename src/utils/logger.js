'use strict';

const { NODE_ENV } = require('../config/env');

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = NODE_ENV === 'production' ? 'info' : 'debug';

const format = (level, message, meta) => {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] ${message}`;
  return meta ? `${base} ${JSON.stringify(meta)}` : base;
};

const log = (level, message, meta) => {
  if (levels[level] <= levels[currentLevel]) {
    const out = format(level, message, meta);
    if (level === 'error') {
      console.error(out);
    } else {
      console.log(out);
    }
  }
};

module.exports = {
  error: (msg, meta) => log('error', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
};
