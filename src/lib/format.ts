export function formatPrice(amount: number, currency: string): string {
  const n = amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${currency} ${n}`.trim();
}

/** Total units in stock across all sizes. */
export function totalStock(sizes: { stock: number }[]): number {
  return sizes.reduce((sum, s) => sum + s.stock, 0);
}

export function sortSizes<T extends { sort_order: number }>(sizes: T[]): T[] {
  return [...sizes].sort((a, b) => a.sort_order - b.sort_order);
}
