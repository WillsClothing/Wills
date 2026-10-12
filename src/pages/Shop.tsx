import { useMemo, useState } from 'react';
import Logo from '../components/Logo';
import ProductCard from '../components/ProductCard';
import { useStore } from '../lib/store';

export default function Shop() {
  const { products, settings, loading, error } = useStore();
  const [category, setCategory] = useState('All');

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [products]);

  const visible = category === 'All' ? products : products.filter((p) => p.category === category);

  return (
    <>
      <section className="hero">
        <div className="hero-mist" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="container">
          <Logo className="hero-logo" />
          <p className="eyebrow">New collection</p>
          <h1>
            <span className="line">
              <span>Wear it</span>
            </span>
            <span className="line">
              <span>
                your <em>way</em>
              </span>
            </span>
          </h1>
          <p>Pick your size, add to cart and order on WhatsApp. Cash on Delivery or bank transfer.</p>
          <a href="#collection" className="btn btn-gold">
            Shop the collection
          </a>
        </div>
      </section>

      <div className="container page" id="collection" style={{ paddingTop: 0 }}>
        <div className="section-title">
          <p className="eyebrow">{settings.store_name}</p>
          <h2>The collection</h2>
        </div>
        {categories.length > 2 && (
          <div className="filters" role="tablist">
            {categories.map((c) => (
              <button
                key={c}
                className={`chip ${c === category ? 'active' : ''}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        {categories.length <= 2 && <div style={{ height: 32 }} />}

        {loading && <p className="muted center">Loading products…</p>}
        {error && <p className="error center">{error}</p>}
        {!loading && !error && visible.length === 0 && (
          <div className="empty">
            <h2>New collection coming soon</h2>
            <p className="muted">Check back shortly.</p>
          </div>
        )}

        <div className="grid">
          {visible.map((p) => (
            <ProductCard key={p.id} product={p} currency={settings.currency} />
          ))}
        </div>
      </div>
    </>
  );
}
