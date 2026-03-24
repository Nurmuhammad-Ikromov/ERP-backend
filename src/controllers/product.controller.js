'use strict';

const productService = require('../services/product.service');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const result = await productService.list(req.query);
  res.json({ status: 'success', data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const product = await productService.getById(req.params.id);
  res.json({ status: 'success', data: { product } });
});

const getByBarcode = asyncHandler(async (req, res) => {
  const product = await productService.getByBarcode(req.params.barcode);
  res.json({ status: 'success', data: { product } });
});

const search = asyncHandler(async (req, res) => {
  const products = await productService.search(req.query.q);
  res.json({ status: 'success', data: { products } });
});

const create = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (body.productType && !body.type) body.type = body.productType;
  const product = await productService.create(body, req.user._id);
  res.status(201).json({ status: 'success', data: { product } });
});

const update = asyncHandler(async (req, res) => {
  const product = await productService.update(req.params.id, req.body);
  res.json({ status: 'success', data: { product } });
});

const archive = asyncHandler(async (req, res) => {
  const product = await productService.archive(req.params.id);
  res.json({ status: 'success', data: { product } });
});

const remove = asyncHandler(async (req, res) => {
  const product = await productService.remove(req.params.id);
  res.json({ status: 'success', data: { product } });
});

module.exports = { list, getOne, getByBarcode, search, create, update, archive, remove };
