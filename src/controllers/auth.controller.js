'use strict';

const authService = require('../services/auth.service');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

const register = asyncHandler(async (req, res) => {
  const { fullName, username, password, role } = req.body;
  const { token, user } = await authService.register({ fullName, username, password, role });
  res.status(201).json({ status: 'success', token, data: { user } });
});

const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const { token, user } = await authService.login({ username, password });

  // Also set httpOnly cookie for browser clients
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.status(200).json({ status: 'success', token, data: { user } });
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.me(req.user._id);
  res.status(200).json({ status: 'success', data: { user } });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie('token');
  res.status(200).json({ status: 'success', message: 'Logged out' });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user) throw new AppError('Foydalanuvchi topilmadi', 404);

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw new AppError('Joriy parol noto\'g\'ri', 400);

  user.passwordHash = newPassword;
  await user.save();

  res.json({ status: 'success', message: 'Parol muvaffaqiyatli o\'zgartirildi' });
});

module.exports = { register, login, me, logout, changePassword };
