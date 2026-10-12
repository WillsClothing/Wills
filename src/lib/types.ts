export type ProductStatus = 'available' | 'sold_out' | 'unavailable';

export interface ProductSize {
  id: string;
  product_id: string;
  size: string;
  stock: number;
  sort_order: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  status: ProductStatus;
  images: string[];
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
  product_name: string;
  size: string;
  change: number;
  new_stock: number;
  reason: string;
  created_at: string;
}

export type PaymentMethod = 'cod' | 'bank';
