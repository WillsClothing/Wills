import type { Product, StoreSettings } from './types';

// Sample data shown only when Supabase is not configured yet, so the
// storefront can be previewed before the database is set up.

const svg = (label: string, shade: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750"><rect width="600" height="750" fill="${shade}"/><text x="300" y="390" font-family="Helvetica,Arial,sans-serif" font-size="34" letter-spacing="6" text-anchor="middle" fill="${shade === '#111111' ? '#ffffff' : '#111111'}">${label}</text></svg>`,
  );

const now = new Date().toISOString();

function product(
  id: string,
  name: string,
  price: number,
  category: string,
  shade: string,
  stock: Record<string, number>,
  status: Product['status'] = 'available',
): Product {
  return {
    id,
    name,
    description:
      'Demo product. Connect Supabase and add your real products from the admin portal.',
    price,
    category,
    status,
    images: [svg(name.toUpperCase(), shade)],
    sort_order: 0,
    created_at: now,
    updated_at: now,
    product_sizes: Object.entries(stock).map(([size, qty], i) => ({
      id: `${id}-${size}`,
      product_id: id,
      size,
      stock: qty,
      sort_order: i,
    })),
  };
}

export const demoProducts: Product[] = [
  product('demo-1', 'Classic Black Tee', 2500, 'T-Shirts', '#111111', { S: 5, M: 8, L: 3, XL: 0 }),
  product('demo-2', 'Essential White Tee', 2500, 'T-Shirts', '#f2f2f2', { S: 2, M: 0, L: 6, XL: 4 }),
  product('demo-3', 'Oversized Hoodie', 6900, 'Hoodies', '#d9d9d9', { M: 4, L: 4, XL: 2 }),
  product('demo-4', 'Monochrome Shirt', 4800, 'Shirts', '#111111', { S: 0, M: 0, L: 0 }, 'sold_out'),
];

export const demoSettings: StoreSettings = {
  store_name: 'Wills Clothing',
  whatsapp_number: '',
  currency: 'Rs.',
  bank_details: 'Bank: YOUR BANK\nAccount name: Wills Clothing\nAccount no: 000000000\nBranch: YOUR BRANCH',
  delivery_note: '',
};
