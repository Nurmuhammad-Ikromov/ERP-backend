'use strict';

const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { role, isActive, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === 'true';

  const skip = (Number(page) - 1) * Number(limit);
  const [users, total] = await Promise.all([
    User.find(filter).sort('-createdAt').skip(skip).limit(Number(limit)),
    User.countDocuments(filter),
  ]);

  res.json({ status: 'success', data: { users, total, page: Number(page), limit: Number(limit) } });
});

const create = asyncHandler(async (req, res) => {
  const { fullName, username, password, role } = req.body;

  const exists = await User.findOne({ username });
  if (exists) throw new AppError('Username already taken', 409);

  const user = await User.create({ fullName, username, passwordHash: password, role });
  res.status(201).json({ status: 'success', data: { user } });
});

const update = asyncHandler(async (req, res) => {
  const { fullName, username, password, role } = req.body;

  const user = await User.findById(req.params.id).select('+passwordHash');
  if (!user) throw new AppError('User not found', 404);

  if (fullName) user.fullName = fullName;
  if (role) user.role = role;

  if (username && username !== user.username) {
    const taken = await User.findOne({ username });
    if (taken) throw new AppError('Username already taken', 409);
    user.username = username;
  }

  if (password) {
    user.passwordHash = password; // pre('save') hook will hash it
  }

  await user.save();
  res.json({ status: 'success', data: { user } });
});

const updateStatus = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { $set: { isActive: req.body.isActive } },
    { new: true }
  );
  if (!user) throw new AppError('User not found', 404);
  res.json({ status: 'success', data: { user } });
});

module.exports = { list, create, update, updateStatus };
