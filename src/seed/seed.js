'use strict';

/**
 * Seed script — run with: node src/seed/seed.js
 *
 * Creates:
 *  - 1 admin user
 *  - 2 seller users (Hayot, Izzat)
 *  - 4 sample products (2 unit, 2 weight with bag tracking)
 *
 * Safe to re-run — skips records that already exist (upsert).
 */

require('dotenv').config();
const mongoose = require('mongoose');

const { MONGO_URI } = require('../config/env');
const User = require('../models/User');
const Product = require('../models/Product');

const seed = async () => {
  await mongoose.connect(MONGO_URI);
  console.log('[Seed] Connected to MongoDB');

  // ── Users ──────────────────────────────────────────────────
  // NOTE: passwordHash field holds plain text here — the model's pre('save')
  // hook will hash it automatically via bcrypt.
  const users = [
    {
      fullName: 'Admin User',
      username: 'admin',
      passwordHash: 'admin123',
      role: 'admin',
    },
    {
      fullName: 'Hayot Seller',
      username: 'hayot',
      passwordHash: 'seller123',
      role: 'seller',
    },
    {
      fullName: 'Izzat Seller',
      username: 'izzat',
      passwordHash: 'seller123',
      role: 'seller',
    },
    {
      fullName: 'Do\'kon Egasi',
      username: 'ega',
      passwordHash: 'ega123',
      role: 'admin',
    },
    {
      fullName: 'Kassir',
      username: 'kassir',
      passwordHash: 'kassir123',
      role: 'seller',
    },
  ];

  for (const u of users) {
    const exists = await User.findOne({ username: u.username });
    if (!exists) {
      await User.create(u);
      console.log(`[Seed] Created user: ${u.username}`);
    } else {
      console.log(`[Seed] User exists, skipping: ${u.username}`);
    }
  }

  const admin = await User.findOne({ username: 'admin' });

  // ── Products ───────────────────────────────────────────────
  const products = [
    // Unit products
    {
      name: 'Sunflower Oil 5L',
      sku: 'OIL-5L',
      barcode: '4600000000001',
      type: 'unit',
      category: 'Oil',
      unitLabel: 'bottle',
      salePrice: 65000,
      averageCostPrice: 55000,
      stockQuantity: 24,
      totalStockValue: 24 * 55000, // 1,320,000
      lowStockThreshold: 5,
      createdBy: admin._id,
    },
    {
      name: 'Bran Bag 40kg',
      sku: 'BRAN-40',
      type: 'unit',
      category: 'Feed',
      unitLabel: 'bag',
      salePrice: 95000,
      averageCostPrice: 80000,
      stockQuantity: 50,
      totalStockValue: 50 * 80000, // 4,000,000
      lowStockThreshold: 10,
      createdBy: admin._id,
    },
    // Weight products with bag tracking
    {
      name: 'Mutabar Flour',
      sku: 'FLOUR-MUTABAR',
      barcode: '4600000000002',
      type: 'weight',
      category: 'Flour',
      unitLabel: 'kg',
      salePrice: 4200,         // per kg
      averageCostPrice: 3500,  // per kg
      stockWeightKg: 2500,     // 50 bags × 50 kg
      bagsCount: 50,
      kgPerBag: 50,
      totalStockValue: 2500 * 3500, // 8,750,000
      lowStockThreshold: 100, // alert if below 100 kg
      createdBy: admin._id,
    },
    {
      name: 'Rice Premium',
      sku: 'RICE-PREM',
      type: 'weight',
      category: 'Grains',
      unitLabel: 'kg',
      salePrice: 12500,        // per kg
      averageCostPrice: 10000, // per kg
      stockWeightKg: 1000,     // 20 bags × 50 kg
      bagsCount: 20,
      kgPerBag: 50,
      totalStockValue: 1000 * 10000, // 10,000,000
      lowStockThreshold: 50,
      createdBy: admin._id,
    },
  ];

  for (const p of products) {
    const exists = await Product.findOne({ sku: p.sku });
    if (!exists) {
      await Product.create(p);
      console.log(`[Seed] Created product: ${p.name}`);
    } else {
      console.log(`[Seed] Product exists, skipping: ${p.name}`);
    }
  }

  console.log('\n[Seed] Done.');
  console.log('  Admin login:  username=admin   password=admin123');
  console.log('  Seller login: username=hayot   password=seller123');
  console.log('  Seller login: username=izzat   password=seller123');
  console.log('  Ega login:    username=ega      password=ega123');
  console.log('  Kassir login: username=kassir   password=kassir123\n');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error('[Seed] Error:', err.message);
  process.exit(1);
});
