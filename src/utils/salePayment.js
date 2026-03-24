'use strict';

const AppError = require('./AppError');

const PAYMENT_TYPES = Object.freeze({
  CASH: 'cash',
  CARD: 'card',
  DEBT: 'debt',
  MIXED: 'mixed',
});

const MONEY_EPSILON = 0.01;

const roundMoney = (value) =>
  Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;

const isPositiveMoney = (value) => roundMoney(value) > MONEY_EPSILON;

const classifyPaymentType = ({ cashPaid = 0, cardPaid = 0, debtAmount = 0 }) => {
  const hasCash = isPositiveMoney(cashPaid);
  const hasCard = isPositiveMoney(cardPaid);
  const hasDebt = isPositiveMoney(debtAmount);
  const partsCount = [hasCash, hasCard, hasDebt].filter(Boolean).length;

  if (partsCount <= 1) {
    if (hasCard) return PAYMENT_TYPES.CARD;
    if (hasDebt) return PAYMENT_TYPES.DEBT;
    return PAYMENT_TYPES.CASH;
  }

  return PAYMENT_TYPES.MIXED;
};

const resolveSalePayments = (data = {}, total = 0) => {
  const saleTotal = roundMoney(total);
  const hasExplicitBreakdown =
    data.cashPaid != null || data.cardPaid != null || data.debtAmount != null;

  let cashPaid = roundMoney(data.cashPaid);
  let cardPaid = roundMoney(data.cardPaid);
  let debtAmount = data.debtAmount != null ? roundMoney(data.debtAmount) : null;

  if (!hasExplicitBreakdown) {
    switch (data.paymentType) {
      case PAYMENT_TYPES.CARD:
        cardPaid = saleTotal;
        break;
      case PAYMENT_TYPES.DEBT:
        debtAmount = saleTotal;
        break;
      case PAYMENT_TYPES.CASH:
      case PAYMENT_TYPES.MIXED:
      default:
        cashPaid = saleTotal;
        break;
    }
  }

  if (debtAmount == null) {
    debtAmount = roundMoney(saleTotal - cashPaid - cardPaid);
  }

  if ([cashPaid, cardPaid, debtAmount].some((amount) => amount < 0)) {
    throw new AppError("To'lov summalari manfiy bo'lishi mumkin emas", 400);
  }

  const paidAmount = roundMoney(cashPaid + cardPaid);
  const breakdownTotal = roundMoney(paidAmount + debtAmount);

  if (paidAmount - saleTotal > MONEY_EPSILON) {
    throw new AppError("Naqd va karta summasi jami sotuvdan oshib ketdi", 400);
  }

  if (Math.abs(breakdownTotal - saleTotal) > MONEY_EPSILON) {
    throw new AppError("To'lov taqsimoti jami sotuvga teng bo'lishi kerak", 400);
  }

  return {
    cashPaid,
    cardPaid,
    paidAmount,
    debtAmount,
    paymentType: classifyPaymentType({ cashPaid, cardPaid, debtAmount }),
  };
};

const buildLegacyAmountExpr = (legacyType) => ({
  $cond: [{ $eq: ['$paymentType', legacyType] }, '$total', 0],
});

const buildCashPaidExpr = () => ({
  $ifNull: ['$cashPaid', buildLegacyAmountExpr(PAYMENT_TYPES.CASH)],
});

const buildCardPaidExpr = () => ({
  $ifNull: ['$cardPaid', buildLegacyAmountExpr(PAYMENT_TYPES.CARD)],
});

const buildDebtAmountExpr = () => ({
  $ifNull: ['$debtAmount', buildLegacyAmountExpr(PAYMENT_TYPES.DEBT)],
});

const buildPaymentLabel = ({ paymentType, cashPaid = 0, cardPaid = 0, debtAmount = 0 }) => {
  const resolvedType =
    paymentType || classifyPaymentType({ cashPaid, cardPaid, debtAmount });

  switch (resolvedType) {
    case PAYMENT_TYPES.CARD:
      return 'Karta';
    case PAYMENT_TYPES.DEBT:
      return 'Nasiya';
    case PAYMENT_TYPES.MIXED:
      return "Aralash to'lov";
    case PAYMENT_TYPES.CASH:
    default:
      return 'Naqd pul';
  }
};

const buildPaymentBreakdown = ({ cashPaid = 0, cardPaid = 0, debtAmount = 0 }) => {
  const parts = [];
  if (isPositiveMoney(cashPaid)) parts.push({ key: 'cash', label: 'Naqd', amount: roundMoney(cashPaid) });
  if (isPositiveMoney(cardPaid)) parts.push({ key: 'card', label: 'Karta', amount: roundMoney(cardPaid) });
  if (isPositiveMoney(debtAmount)) parts.push({ key: 'debt', label: 'Nasiya', amount: roundMoney(debtAmount) });
  return parts;
};

module.exports = {
  PAYMENT_TYPES,
  buildCardPaidExpr,
  buildCashPaidExpr,
  buildDebtAmountExpr,
  buildPaymentBreakdown,
  buildPaymentLabel,
  classifyPaymentType,
  resolveSalePayments,
  roundMoney,
};
