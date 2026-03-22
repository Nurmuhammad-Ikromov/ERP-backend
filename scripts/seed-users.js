'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { MONGO_URI } = require('../src/config/env');

const users = [
  {
    fullName: 'Хаёт',
    username: 'хаёт',
    passwordHash: '7984',
    role: 'admin',
  },
  {
    fullName: 'Izzat',
    username: 'izzat',
    passwordHash: '1984',
    role: 'seller',
  },
  {
    fullName: 'Salomat',
    username: 'salomat',
    passwordHash: '1984',
    role: 'seller',
  },
];

(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('[DB] Connected');

    for (const data of users) {
      const exists = await User.findOne({ username: data.username });
      if (exists) {
        console.log(`[SKIP] "${data.username}" allaqachon mavjud`);
        continue;
      }
      const user = new User(data);
      await user.save();
      console.log(`[OK] "${data.username}" (${data.role}) qo'shildi`);
    }
  } catch (err) {
    console.error('[ERROR]', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('[DB] Disconnected');
  }
})();
