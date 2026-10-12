import type { Product } from './types';

/** Product types the store sells. Add a name here to offer it in the admin dropdown. */
export const CATEGORIES = ['T-Shirts', 'Shorts'];

export interface PriceBand {
  label: string;
  min: number;
  max: number;
}

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

/** Splits the catalogue's prices into up to three tidy bands, e.g. "Under 2,500". */
export function priceBands(products: Product[], format: (n: number) => string): PriceBand[] {
  const prices = products.map((p) => p.price).sort((a, b) => a - b);
  if (prices.length < 2 || prices[0] === prices[prices.length - 1]) return [];
  const min = prices[0];
  const max = prices[prices.length - 1];
  const step = max - min > 5000 ? 1000 : max - min > 1000 ? 500 : 100;
  const cuts = Array.from(new Set([roundTo(min + (max - min) / 3, step), roundTo(min + (2 * (max - min)) / 3, step)]))
    .filter((c) => c > min && c <= max)
    .sort((a, b) => a - b);
  if (!cuts.length) return [];
  const bands: PriceBand[] = [{ label: `Under ${format(cuts[0])}`, min: 0, max: cuts[0] }];
  for (let i = 1; i < cuts.length; i++) {
    bands.push({ label: `${format(cuts[i - 1])} – ${format(cuts[i])}`, min: cuts[i - 1], max: cuts[i] });
  }
  bands.push({ label: `${format(cuts[cuts.length - 1])} and above`, min: cuts[cuts.length - 1], max: Infinity });
  return bands;
}
