import { supabase, isConfigured, IMAGE_BUCKET } from './supabase';
import { demoProducts, demoSettings } from './demo';
import type { InventoryLogEntry, Product, ProductColor, ProductStatus, Promotion, SizeChart, StoreSettings } from './types';

const PRODUCT_SELECT = '*, product_sizes(*)';

function db() {
  if (!supabase) throw new Error('Supabase is not configured. See README.md.');
  return supabase;
}

function normalize(p: Product): Product {
  return {
    ...p,
    sku: p.sku ?? null,
    price: Number(p.price),
    colors: Array.isArray(p.colors) ? p.colors : [],
    size_chart: p.size_chart && Array.isArray(p.size_chart.columns) ? p.size_chart : null,
    product_sizes: (p.product_sizes ?? []).map((s) => ({ ...s, color: s.color ?? '', sku: s.sku ?? '', barcode: s.barcode ?? null })),
  };
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
  const settings = (data as StoreSettings) ?? demoSettings;
  // Until a number is saved in Admin → Settings, orders go to the store's main WhatsApp.
  return { ...settings, whatsapp_number: settings.whatsapp_number || demoSettings.whatsapp_number };
}

function normalizePromotion(p: Promotion): Promotion {
  return {
    ...p,
    kind: p.kind === 'special' ? 'special' : 'combo',
    price: Number(p.price),
    compare_price: p.compare_price == null ? null : Number(p.compare_price),
    product_ids: p.product_ids ?? [],
  };
}

/** Promotions running today. Returns none (rather than failing) if the table has not been created yet. */
export async function fetchLivePromotions(): Promise<Promotion[]> {
  if (!isConfigured) return [];
  const { data, error } = await db().from('promotions').select('*').eq('active', true).order('sort_order').order('created_at');
  if (error) return [];
  return (data as Promotion[]).map(normalizePromotion).filter((p) => isLive(p));
}

/** Active and inside its optional date range, by the visitor's local date. */
export function isLive(p: Promotion, today = new Date()): boolean {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return p.active && (!p.starts_on || p.starts_on <= d) && (!p.ends_on || p.ends_on >= d);
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'promotions' }, onChange)
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

/** One size in one colour ('' = no colour) with the stock the admin wants it to have. */
export interface SizeInput {
  id?: string;
  size: string;
  color: string;
  stock: number;
}

export interface ProductInput {
  name: string;
  description: string;
  price: number;
  category: string;
  status: ProductStatus;
  images: string[];
  colors: ProductColor[];
  size_chart: SizeChart | null;
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

  // Until colors.sql has been run there is no colors column: products without colours still save.
  const write = (row: Partial<typeof fields>) =>
    productId
      ? client.from('products').update(row).eq('id', productId).select('id').single()
      : client.from('products').insert(row).select('id').single();

  let productId = id;
  let existing: Product | null = null;
  let { data, error } = await write(fields);
  // Until size_chart.sql has been run there is no size_chart column: products without a chart still save.
  if (error && /size_chart/.test(error.message) && !fields.size_chart) {
    const { size_chart: _chart, ...rest } = fields;
    ({ data, error } = await write(rest));
  }
  if (error && /colors/.test(error.message) && fields.colors.length === 0) {
    const { colors: _unused, size_chart: _chart, ...rest } = fields;
    ({ data, error } = await write(fields.size_chart ? { ...rest, size_chart: fields.size_chart } : rest));
  }
  if (error && /size_chart/.test(error.message)) {
    throw new Error('Size charts are not set up in the database yet. Run supabase/size_chart.sql in the Supabase SQL Editor, then save again.');
  }
  if (error) throw colorsHint(error);
  if (productId) existing = await fetchProduct(productId);
  else productId = data!.id as string;

  const oldSizes = existing?.product_sizes ?? [];
  const keepIds = new Set(sizes.filter((s) => s.id).map((s) => s.id));
  const removed = oldSizes.filter((s) => !keepIds.has(s.id));
  if (removed.length) {
    const { error } = await client.from('product_sizes').delete().in('id', removed.map((s) => s.id));
    if (error) throw error;
  }

  const hasColors = sizes.some((s) => s.color);
  for (const [index, s] of sizes.entries()) {
    const row: Record<string, unknown> = { size: s.size.trim(), sort_order: index };
    // Only send the colour column when it is used, so stores that have not run variants.sql keep working.
    if (hasColors || oldSizes.some((o) => o.color)) row.color = s.color;
    if (s.id) {
      const { error } = await client.from('product_sizes').update(row).eq('id', s.id);
      if (error) throw variantsHint(error);
      const before = oldSizes.find((o) => o.id === s.id)?.stock ?? 0;
      if (s.stock !== before) await adjustStock(s.id, s.stock - before, 'Edited in product form');
    } else {
      const { data, error } = await client
        .from('product_sizes')
        .insert({ ...row, product_id: productId, stock: 0 })
        .select('id')
        .single();
      if (error) throw variantsHint(error);
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

/** Every stock change between two moments (inclusive start, exclusive end), oldest first. */
export async function fetchInventoryLogBetween(from: Date, to: Date): Promise<InventoryLogEntry[]> {
  const { data, error } = await db()
    .from('inventory_log')
    .select('id, product_id, product_name, size, change, new_stock, reason, created_at')
    .gte('created_at', from.toISOString())
    .lt('created_at', to.toISOString())
    .order('created_at', { ascending: true })
    .limit(5000);
  if (error) throw error;
  return data as InventoryLogEntry[];
}

function variantsHint(error: { message: string }) {
  return /color|duplicate key/.test(error.message)
    ? new Error('Stock per colour is not set up in the database yet. Run supabase/variants.sql in the Supabase SQL Editor, then save again.')
    : error;
}

function colorsHint(error: { message: string }) {
  return /colors/.test(error.message)
    ? new Error('Colours are not set up in the database yet. Run supabase/colors.sql in the Supabase SQL Editor, then save again.')
    : error;
}

/** Colours the admin added beyond the presets, kept in store settings so every product can reuse them. */
export async function fetchCustomColors(): Promise<ProductColor[]> {
  if (!isConfigured) return [];
  const { data, error } = await db().from('store_settings').select('custom_colors').eq('id', 1).maybeSingle();
  if (error || !data) return [];
  return Array.isArray(data.custom_colors) ? (data.custom_colors as ProductColor[]) : [];
}

export async function saveCustomColors(colors: ProductColor[]) {
  const { error } = await db().from('store_settings').update({ custom_colors: colors }).eq('id', 1);
  if (error) throw colorsHint(error);
}

export async function updateSettings(settings: StoreSettings) {
  // Saved colours are managed from the product form; never overwrite them with a stale copy.
  const { custom_colors: _colors, ...rest } = settings as StoreSettings & { custom_colors?: unknown };
  const { error } = await db().from('store_settings').update(rest).eq('id', 1);
  if (error) throw error;
}

// ---------------------------------------------------------------- promotions (admin)

export type PromotionInput = Omit<Promotion, 'id' | 'created_at'>;

export async function fetchAllPromotions(): Promise<Promotion[]> {
  const { data, error } = await db().from('promotions').select('*').order('sort_order').order('created_at', { ascending: false });
  if (error) throw error;
  return (data as Promotion[]).map(normalizePromotion);
}

export async function savePromotion(id: string | null, input: PromotionInput): Promise<void> {
  const { error } = id
    ? await db().from('promotions').update(input).eq('id', id)
    : await db().from('promotions').insert(input);
  if (error && /kind/.test(error.message)) {
    throw new Error('The offers table needs a quick update. Run supabase/promotions.sql again in the Supabase SQL Editor, then save.');
  }
  if (error) throw error;
}

export async function deletePromotion(id: string): Promise<void> {
  const { error } = await db().from('promotions').delete().eq('id', id);
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
