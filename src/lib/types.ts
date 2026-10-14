export type ProductStatus = 'available' | 'sold_out' | 'unavailable';

/** One sellable variant: a size in a colour, with its own stock, SKU and barcode. */
export interface ProductSize {
  id: string;
  product_id: string;
  size: string;
  /** Colour name, '' when the product has no colour choice. */
  color: string;
  stock: number;
  sort_order: number;
  sku: string;
  /** EAN-13 (prefix 200, in-store range). Null until variants.sql has been run. */
  barcode: string | null;
}

export interface ProductColor {
  name: string;
  hex: string;
}

export interface Product {
  id: string;
  /** Style code, e.g. WC-TSH-1001. Set by the database when the product is created. */
  sku: string | null;
  name: string;
  description: string;
  price: number;
  category: string;
  status: ProductStatus;
  images: string[];
  /** Colours this product comes in, chosen by the admin. Empty = no colour choice. */
  colors: ProductColor[];
  sort_order: number;
  created_at: string;
  updated_at: string;
  product_sizes: ProductSize[];
  /** Measurements per size, shown in the Size guide. Null until the admin adds one. */
  size_chart: SizeChart | null;
}

export interface SizeChart {
  unit: 'in' | 'cm';
  /** Measurement names, e.g. Chest, Length, Shoulder, Sleeve. */
  columns: string[];
  rows: { size: string; values: string[] }[];
  /** Fit note shown under Fit & Sizing, e.g. "Relaxed fit. Model is 6'0" and wears L." */
  note: string;
  /** Optional picture of the chart or how to measure. */
  image: string;
}

export interface StoreSettings {
  store_name: string;
  whatsapp_number: string;
  currency: string;
  bank_details: string;
  delivery_note: string;
}

export interface InventoryLogEntry {
  id: number;
  product_id?: string | null;
  product_name: string;
  size: string;
  change: number;
  new_stock: number;
  reason: string;
  created_at: string;
}

export type PaymentMethod = 'cod' | 'bank';

export type PromotionKind = 'combo' | 'special';

export interface Promotion {
  id: string;
  /** combo = several products for one price, special = a discount on one product */
  kind: PromotionKind;
  title: string;
  description: string;
  price: number;
  compare_price: number | null;
  product_ids: string[];
  image: string;
  active: boolean;
  starts_on: string | null;
  ends_on: string | null;
  sort_order: number;
  created_at: string;
}
