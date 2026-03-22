'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/env');

const signToken = (userId, role) =>
  jwt.sign({ id: userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

const register = async ({ fullName, username, password, role = 'seller' }) => {
  const exists = await User.findOne({ username });
  if (exists) throw new AppError('Username already taken', 409);

  const user = await User.create({ fullName, username, passwordHash: password, role });
  const token = signToken(user._id, user.role);
  return { token, user };
};

const login = async ({ username, password }) => {
  const user = await User.findOne({ username, isActive: true }).select('+passwordHash');
  if (!user) throw new AppError('Invalid credentials', 401);

  const valid = await user.comparePassword(password);
  if (!valid) throw new AppError('Invalid credentials', 401);

  const token = signToken(user._id, user.role);
  return { token, user };
};

const me = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  return user;
};

module.exports = { signToken, register, login, me };
