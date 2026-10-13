import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Product } from './types';

// The cart lives only in the visitor's browser. Adding to it never touches
// the database, so stock is unchanged until an admin updates it manually.

export interface CartItem {
  productId: string;
  sizeId: string;
  size: string;
  /** Chosen colour name, for products that come in colours. */
  color?: string;
  quantity: number;
}

/** One cart line per size and colour. */
export const lineKey = (i: Pick<CartItem, 'sizeId' | 'color'>) => `${i.sizeId}|${i.color ?? ''}`;

/** Units of a size already in the cart, across every colour (stock is kept per size). */
export const sizeInCart = (items: CartItem[], sizeId: string) =>
  items.filter((i) => i.sizeId === sizeId).reduce((n, i) => n + i.quantity, 0);

export interface ResolvedCartItem extends CartItem {
  product: Product | undefined;
  /** Units currently in stock for this size (0 if the product/size is gone). */
  available: number;
  orderable: boolean;
  lineTotal: number;
}

interface CartState {
  items: CartItem[];
  count: number;
  add: (item: CartItem) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const STORAGE_KEY = 'wills-cart-v1';
const CartContext = createContext<CartState | null>(null);

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable – cart still works for this visit */
    }
  }, [items]);

  const value = useMemo<CartState>(
    () => ({
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      add: (item) =>
        setItems((prev) => {
          const existing = prev.find((i) => lineKey(i) === lineKey(item));
          if (existing) {
            return prev.map((i) =>
              lineKey(i) === lineKey(item) ? { ...i, quantity: i.quantity + item.quantity } : i,
            );
          }
          return [...prev, item];
        }),
      setQuantity: (key, quantity) =>
        setItems((prev) =>
          prev.map((i) => (lineKey(i) === key ? { ...i, quantity: Math.max(1, quantity) } : i)),
        ),
      remove: (key) => setItems((prev) => prev.filter((i) => lineKey(i) !== key)),
      clear: () => setItems([]),
    }),
    [items],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}

/** Joins cart items with the live catalogue so prices and stock are always current. */
export function resolveCart(items: CartItem[], products: Product[]): ResolvedCartItem[] {
  return items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    const size = product?.product_sizes.find((s) => s.id === item.sizeId);
    // Stock is per size, so other colours of the same size share it.
    const others = sizeInCart(items, item.sizeId) - item.quantity;
    const available = product?.status === 'available' && size ? Math.max(0, size.stock - others) : 0;
    return {
      ...item,
      product,
      available,
      orderable: available >= item.quantity && item.quantity > 0,
      lineTotal: (product?.price ?? 0) * item.quantity,
    };
  });
}
