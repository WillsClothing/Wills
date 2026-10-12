import { formatPrice } from './format';
import type { ResolvedCartItem } from './cart';
import type { PaymentMethod, StoreSettings } from './types';

export interface CustomerDetails {
  name: string;
  phone: string;
  address: string;
  notes: string;
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cod: 'Cash on Delivery',
  bank: 'Bank Transfer',
};

/** Keeps digits only, so "+94 77-123 4567" becomes "94771234567" as wa.me expects. */
export function cleanNumber(n: string): string {
  return n.replace(/\D/g, '');
}

export function whatsappLink(number: string, text?: string): string {
  const base = `https://wa.me/${cleanNumber(number)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function buildOrderMessage(
  items: ResolvedCartItem[],
  payment: PaymentMethod,
  customer: CustomerDetails,
  settings: StoreSettings,
): string {
  const c = settings.currency;
  const total = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const lines = items.map(
    (i, n) =>
      `${n + 1}. ${i.product?.name ?? 'Item'}\n   Size: ${i.size} | Qty: ${i.quantity} | ${formatPrice(
        i.product?.price ?? 0,
        c,
      )} each = ${formatPrice(i.lineTotal, c)}`,
  );

  const parts = [
    `Hello ${settings.store_name}! I would like to place an order:`,
    '',
    ...lines,
    '',
    `*Total: ${formatPrice(total, c)}*`,
    `Payment method: ${PAYMENT_LABELS[payment]}`,
  ];

  const details = [
    customer.name && `Name: ${customer.name}`,
    customer.phone && `Phone: ${customer.phone}`,
    customer.address && `Delivery address: ${customer.address}`,
    customer.notes && `Notes: ${customer.notes}`,
  ].filter(Boolean);
  if (details.length) parts.push('', ...(details as string[]));

  if (payment === 'bank') {
    parts.push('', 'I will send the bank transfer receipt here.');
  }
  return parts.join('\n');
}
