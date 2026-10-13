import type { ProductColor } from './types';

/** Ready-made colours offered in the admin product form. Admins can add their own on top. */
export const PRESET_COLORS: ProductColor[] = [
  { name: 'Black', hex: '#111111' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Off White', hex: '#f3eee3' },
  { name: 'Beige', hex: '#dcc9a6' },
  { name: 'Sand', hex: '#c8b08a' },
  { name: 'Brown', hex: '#6b4a32' },
  { name: 'Charcoal', hex: '#3a3d42' },
  { name: 'Grey', hex: '#9a9a9a' },
  { name: 'Navy', hex: '#1f2a44' },
  { name: 'Royal Blue', hex: '#2747a8' },
  { name: 'Sky Blue', hex: '#8fbbe0' },
  { name: 'Bottle Green', hex: '#1f4a35' },
  { name: 'Olive', hex: '#6b6b3a' },
  { name: 'Sage', hex: '#a7b59a' },
  { name: 'Maroon', hex: '#6d1f2a' },
  { name: 'Red', hex: '#c0282d' },
  { name: 'Pink', hex: '#efb4c3' },
  { name: 'Lavender', hex: '#b9a7d6' },
  { name: 'Mustard', hex: '#d1a43a' },
  { name: 'Orange', hex: '#e07b2e' },
];

export const sameColor = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether a swatch is light enough to need an outline on a light background. */
export function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 200;
}
