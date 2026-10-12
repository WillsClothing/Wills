import { supabase, isConfigured, IMAGE_BUCKET } from './supabase';
import { demoProducts, demoSettings } from './demo';
import type { InventoryLogEntry, Product, ProductStatus, StoreSettings } from './types';

const PRODUCT_SELECT = '*, product_sizes(*)';

function db() {
  if (!supabase) throw new Error('Supabase is not configured. See README.md.');
  return supabase;
}

function normalize(p: Product): Product {
  return { ...p, price: Number(p.price), product_sizes: p.product_sizes ?? [] };
}

// ---------------------------------------------------------------- public reads

/** Products visible to customers (RLS hides "unavailable" ones for visitors). */
export async function fetchShopProducts(): Promise<Product[]> {
  if (!isConfigured) return demoProducts;
  const { data, error } = await db()
    .from('products')
    .select(PRODUCT_SELECT)
    .neq('status', 'unavailable')
    .order('sort_order')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as Product[]).map(normalize);
}

export async function fetchProduct(id: string): Promise<Product | null> {
  if (!isConfigured) return demoProducts.find((p) => p.id === id) ?? null;
  const { data, error } = await db().from('products').select(PRODUCT_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? normalize(data as Product) : null;
}

export async function fetchSettings(): Promise<StoreSettings> {
  if (!isConfigured) return demoSettings;
  const { data, error } = await db().from('store_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return (data as StoreSettings) ?? demoSettings;
}

/** Calls `onChange` whenever products, sizes/stock or settings change in the database. */
export function subscribeToCatalog(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  const channel = client
    .channel('catalog')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'product_sizes' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'store_settings' }, onChange)
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}

// ---------------------------------------------------------------- auth

export async function signIn(email: string, password: string) {
  const { error } = await db().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await db().auth.signOut();
}

/** True if the signed-in user is listed in the `admins` table. */
export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await db().rpc('is_admin');
  if (error) throw error;
  return Boolean(data);
}

// ---------------------------------------------------------------- admin

export async function fetchAllProducts(): Promise<Product[]> {
  const { data, error } = await db()
    .from('products')
    .select(PRODUCT_SELECT)
    .order('sort_order')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as Product[]).map(normalize);
}

export interface SizeInput {
  id?: string;
  size: string;
  stock: number;
}

export interface ProductInput {
  name: string;
  description: string;
  price: number;
  category: string;
  status: ProductStatus;
  images: string[];
  sort_order: number;
  sizes: SizeInput[];
}

/**
 * Creates or updates a product and its sizes. Every stock change goes through
 * the `adjust_stock` database function so it is recorded in the inventory log.
 */
export async function saveProduct(id: string | null, input: ProductInput): Promise<string> {
  const client = db();
  const { sizes, ...fields } = input;

  let productId = id;
  let existing: Product | null = null;
  if (productId) {
    const { error } = await client.from('products').update(fields).eq('id', productId);
    if (error) throw error;
    existing = await fetchProduct(productId);
  } else {
    const { data, error } = await client.from('products').insert(fields).select('id').single();
    if (error) throw error;
    productId = data.id as string;
  }

  const oldSizes = existing?.product_sizes ?? [];
  const keepIds = new Set(sizes.filter((s) => s.id).map((s) => s.id));
  const removed = oldSizes.filter((s) => !keepIds.has(s.id));
  if (removed.length) {
    const { error } = await client.from('product_sizes').delete().in('id', removed.map((s) => s.id));
    if (error) throw error;
  }

  for (const [index, s] of sizes.entries()) {
    const label = s.size.trim();
    if (s.id) {
      const { error } = await client
        .from('product_sizes')
        .update({ size: label, sort_order: index })
        .eq('id', s.id);
      if (error) throw error;
      const before = oldSizes.find((o) => o.id === s.id)?.stock ?? 0;
      if (s.stock !== before) await adjustStock(s.id, s.stock - before, 'Edited in product form');
    } else {
      const { data, error } = await client
        .from('product_sizes')
        .insert({ product_id: productId, size: label, stock: 0, sort_order: index })
        .select('id')
        .single();
      if (error) throw error;
      if (s.stock > 0) await adjustStock(data.id as string, s.stock, 'Initial stock');
    }
  }

  return productId!;
}

export async function deleteProduct(product: Product) {
  const client = db();
  const { error } = await client.from('products').delete().eq('id', product.id);
  if (error) throw error;
  const paths = product.images.map(storagePathFromUrl).filter((p): p is string => Boolean(p));
  if (paths.length) await client.storage.from(IMAGE_BUCKET).remove(paths);
}

export async function setProductStatus(id: string, status: ProductStatus) {
  const { error } = await db().from('products').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function adjustStock(sizeId: string, delta: number, reason: string): Promise<number> {
  const { data, error } = await db().rpc('adjust_stock', {
    p_size_id: sizeId,
    p_delta: delta,
    p_reason: reason,
  });
  if (error) throw error;
  return data as number;
}

export async function fetchInventoryLog(limit = 100): Promise<InventoryLogEntry[]> {
  const { data, error } = await db()
    .from('inventory_log')
    .select('id, product_name, size, change, new_stock, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as InventoryLogEntry[];
}

export async function updateSettings(settings: StoreSettings) {
  const { error } = await db().from('store_settings').update(settings).eq('id', 1);
  if (error) throw error;
}

// ---------------------------------------------------------------- images

export async function uploadImage(file: File): Promise<string> {
  const client = db();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await client.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { cacheControl: '31536000', contentType: file.type });
  if (error) throw error;
  return client.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function deleteImage(url: string) {
  const path = storagePathFromUrl(url);
  if (path) await db().storage.from(IMAGE_BUCKET).remove([path]);
}

function storagePathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${IMAGE_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}
