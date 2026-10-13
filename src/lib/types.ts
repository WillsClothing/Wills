export type ProductStatus = 'available' | 'sold_out' | 'unavailable';

export interface ProductSize {
  id: string;
  product_id: string;
  size: string;
  stock: number;
  sort_order: number;
}

export interface ProductColor {
  name: string;
  hex: string;
}

export interface Product {
  id: string;
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
