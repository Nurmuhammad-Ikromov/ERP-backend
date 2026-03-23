'use strict';

const PAYMENT_LABELS = {
  cash: 'Naqd pul',
  card: 'Karta',
  debt: 'Qarz',
};

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
    paymentLabel: PAYMENT_LABELS[sale.paymentType] || sale.paymentType,
    currency: sale.currency,
    items,
    subtotal: sale.subtotal,
    total: sale.total,
    paidAmount: sale.paidAmount,
    debtAmount: sale.debtAmount,
    customerName: sale.customerName || null,
    customerPhone: sale.customerPhone || null,
    note: sale.note || null,
  };
};

module.exports = { formatReceipt };
