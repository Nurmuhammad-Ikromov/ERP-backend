'use strict';

const { buildPaymentBreakdown, buildPaymentLabel } = require('./salePayment');

/**
 * Builds a structured receipt object from a Sale document.
 * Sale must have seller populated (fullName).
 */
const formatReceipt = (sale) => {
  const sellerName =
    sale.seller && sale.seller.fullName ? sale.seller.fullName : 'Noma\'lum';

  const date = new Date(sale.saleDate);
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  const items = sale.items.map((item) => {
    const isWeight = item.productTypeSnapshot === 'weight';
    let qtyLabel;
    if (isWeight) {
      if (item.bagsCount > 0) {
        qtyLabel = `${item.bagsCount} qop (${item.weightKg.toFixed(2)} kg)`;
      } else {
        qtyLabel = `${item.weightKg.toFixed(3)} kg`;
      }
    } else {
      qtyLabel = `${item.quantity} dona`;
    }

    return {
      name: item.productNameSnapshot,
      qty: qtyLabel,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    };
  });

  return {
    receiptNumber: sale.receiptNumber,
    date: dateStr,
    time: timeStr,
    seller: sellerName,
    paymentType: sale.paymentType,
    paymentLabel: buildPaymentLabel(sale),
    paymentBreakdown: buildPaymentBreakdown(sale),
    currency: sale.currency,
    items,
    subtotal: sale.subtotal,
    total: sale.total,
    cashPaid: sale.cashPaid || 0,
    cardPaid: sale.cardPaid || 0,
    paidAmount: sale.paidAmount,
    debtAmount: sale.debtAmount,
    customerName: sale.customerName || null,
    customerPhone: sale.customerPhone || null,
    note: sale.note || null,
  };
};

/**
 * Builds a receipt object for a debt repayment transaction.
 * tx must have debtAccount populated (customerName, customerPhone, balance).
 * tx must have createdBy populated (fullName).
 */
const formatRepaymentReceipt = (tx, debtAccount) => {
  const date = new Date(tx.date);
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  const paymentMethodLabel = tx.paymentMethod === 'card' ? 'Karta' : 'Naqd';

  return {
    receiptNumber: tx.receiptNumber,
    date: dateStr,
    time: timeStr,
    seller: tx.createdBy?.fullName || 'Noma\'lum',
    paymentType: 'debt_repayment',
    paymentLabel: `Nasiya to\'lovi (${paymentMethodLabel})`,
    paymentBreakdown: `${paymentMethodLabel} ${tx.amount}`,
    currency: debtAccount?.currency || 'UZS',
    items: [],
    subtotal: tx.amount,
    total: tx.amount,
    cashPaid: tx.paymentMethod === 'cash' ? tx.amount : 0,
    cardPaid: tx.paymentMethod === 'card' ? tx.amount : 0,
    paidAmount: tx.amount,
    debtAmount: 0,
    customerName: debtAccount?.customerName || null,
    customerPhone: debtAccount?.customerPhone || null,
    balanceAfter: tx.balanceAfter,
    note: tx.note || null,
    isRepayment: true,
  };
};

module.exports = { formatReceipt, formatRepaymentReceipt };
