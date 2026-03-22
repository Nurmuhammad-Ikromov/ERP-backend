'use strict';

require('dotenv').config();

const MONGO_URI_DEFAULT =
  'mongodb://oroqovhayot772_db_user:2i58kDNJD7PBN27l@ac-u0a8imd-shard-00-00.rrkbmiv.mongodb.net:27017,ac-u0a8imd-shard-00-01.rrkbmiv.mongodb.net:27017,ac-u0a8imd-shard-00-02.rrkbmiv.mongodb.net:27017/?ssl=true&replicaSet=atlas-fcwxq5-shard-0&authSource=admin&appName=ERP';

const JWT_SECRET_DEFAULT = 'change_this_to_a_long_random_secret_string';

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,
  MONGO_URI: process.env.MONGO_URI || MONGO_URI_DEFAULT,
  JWT_SECRET: process.env.JWT_SECRET || JWT_SECRET_DEFAULT,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
  CORS_ORIGINS: process.env.CORS_ORIGINS === '*'
    ? '*'
    : process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
      : '*',
};
