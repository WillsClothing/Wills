import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchLivePromotions, fetchSettings, fetchShopProducts, subscribeToCatalog } from './api';
import { demoSettings } from './demo';
import type { Product, Promotion, StoreSettings } from './types';

interface StoreState {
  products: Product[];
  promotions: Promotion[];
  settings: StoreSettings;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const StoreContext = createContext<StoreState | null>(null);

/** Loads the catalogue and settings, and refreshes them live when an admin changes anything. */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(demoSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [p, s, promos] = await Promise.all([fetchShopProducts(), fetchSettings(), fetchLivePromotions()]);
      setProducts(p);
      setPromotions(promos);
      setSettings(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToCatalog(() => {
      clearTimeout(timer);
      timer = setTimeout(reload, 300);
    });
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('focus', onFocus);
    };
  }, [reload]);

  return (
    <StoreContext.Provider value={{ products, promotions, settings, loading, error, reload }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreState {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
