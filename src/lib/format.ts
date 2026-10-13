export function formatPrice(amount: number, currency: string): string {
  const n = amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${currency} ${n}`.trim();
}

/** Total units in stock across all sizes. */
export function totalStock(sizes: { stock: number }[]): number {
  return sizes.reduce((sum, s) => sum + s.stock, 0);
}

/** "M · Black", or just "M" when there is no colour. */
export function variantLabel(v: { size: string; color?: string }): string {
  return v.color ? `${v.size} · ${v.color}` : v.size;
}

/** Size names in display order, each listed once even when it exists in several colours. */
export function uniqueSizes(sizes: { size: string; sort_order: number }[]): string[] {
  return [...new Set(sortSizes(sizes).map((s) => s.size))];
}

export function sortSizes<T extends { sort_order: number }>(sizes: T[]): T[] {
  return [...sizes].sort((a, b) => a.sort_order - b.sort_order);
}
