import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Logo from '../components/Logo';
import ProductCard, { isSoldOut } from '../components/ProductCard';
import Offers from '../components/Offers';
import Reveal from '../components/Reveal';
import { CATEGORIES, priceBands } from '../lib/catalog';
import { formatPrice } from '../lib/format';
import { useStore } from '../lib/store';
import type { Product } from '../lib/types';

type Sort = 'featured' | 'price-asc' | 'price-desc' | 'newest';

const SORTS: Record<Sort, string> = {
  featured: 'Featured',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  newest: 'Newest',
};

function sortProducts(list: Product[], sort: Sort): Product[] {
  const out = [...list];
  if (sort === 'price-asc') out.sort((a, b) => a.price - b.price);
  if (sort === 'price-desc') out.sort((a, b) => b.price - a.price);
  if (sort === 'newest') out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  // Featured keeps the admin's order but moves sold-out items to the end.
  if (sort === 'featured') out.sort((a, b) => Number(isSoldOut(a)) - Number(isSoldOut(b)));
  return out;
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const PERKS = [
  {
    title: 'Order on WhatsApp',
    text: 'Pick your size, add to cart and send your order in one tap. We confirm every order personally.',
    icon: icon('M4 20l1.3-3.9A8 8 0 1 1 8 18.7L4 20z M9 10c.5 2 2 3.5 4 4l1.2-1.1 2 .9c-.2 1.2-1.2 2-2.4 1.9C10.7 15.4 8.4 13 8.1 10.4 8 9.2 8.9 8.2 10 8l.9 2z'),
  },
  {
    title: 'Cash on Delivery',
    text: 'Pay when your order reaches your door. No cards, no stress.',
    icon: icon('M3 7h18v10H3z M7 7V5h10v2 M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M6 12h.01 M18 12h.01'),
  },
  {
    title: 'Bank Transfer',
    text: 'Prefer to pay ahead? Transfer to our account and send the slip on WhatsApp.',
    icon: icon('M3 10l9-6 9 6 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 20h18'),
  },
];

function spotlight(e: React.MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
}

export default function Shop() {
  const { products, promotions, settings, loading, error } = useStore();
  const [params, setParams] = useSearchParams();
  const type = params.get('type') ?? '';
  const priceKey = params.get('price') ?? '';
  const sort = (params.get('sort') as Sort) in SORTS ? (params.get('sort') as Sort) : 'featured';

  const types = useMemo(() => {
    const present = new Set(products.map((p) => p.category).filter(Boolean));
    return [...CATEGORIES.filter((c) => present.has(c)), ...[...present].filter((c) => !CATEGORIES.includes(c)).sort()];
  }, [products]);

  const bands = useMemo(() => priceBands(products, (n) => formatPrice(n, settings.currency)), [products, settings.currency]);
  const band = priceKey === '' ? undefined : bands[Number(priceKey)];

  const visible = useMemo(() => {
    const list = products.filter(
      (p) => (!type || p.category === type) && (!band || (p.price >= band.min && p.price < band.max)),
    );
    return sortProducts(list, sort);
  }, [products, type, band, sort]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true, preventScrollReset: true });
  }

  function shopType(t: string) {
    update('type', t);
    document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' });
  }

  const filtered = Boolean(type || band);

  return (
    <>
      <section className="hero" onMouseMove={spotlight}>
        <div className="hero-mist" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="container">
          <Logo className="hero-logo" />
          <h1 className="hero-title">
            <span>Right time</span> <span>right now</span>
          </h1>
          <a href="#collection" className="btn btn-gold">
            Shop the collection
          </a>
        </div>
        <svg className="hero-badge" viewBox="0 0 120 120" aria-hidden="true">
          <defs>
            <path id="badge-ring" d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0" />
          </defs>
          <text>
            <textPath href="#badge-ring" textLength="286" lengthAdjust="spacing">Right time · Right now · Wills Clothing ·</textPath>
          </text>
          <circle cx="60" cy="60" r="3" />
        </svg>
        <div className="scroll-cue" aria-hidden="true">
          <span />
        </div>
      </section>

      <section className="perks">
        <div className="container perks-grid">
          {PERKS.map((perk, i) => (
            <Reveal key={perk.title} delay={i * 120} className="perk">
              <span className="perk-icon" aria-hidden="true">
                {perk.icon}
              </span>
              <span className="perk-num">0{i + 1}</span>
              <h3>{perk.title}</h3>
              <p>{perk.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {promotions.length > 0 && <Offers promotions={promotions} products={products} />}

      {types.length > 1 && (
        <section className="container type-tiles">
          {types.map((t, i) => {
            const items = products.filter((p) => p.category === t);
            const cover = items.find((p) => p.images[0])?.images[0];
            return (
              <Reveal key={t} delay={i * 120}>
                <button type="button" className="type-tile" onClick={() => shopType(t)}>
                  {cover ? <img src={cover} alt="" /> : <span className="img-placeholder" />}
                  <span className="type-tile-text">
                    <span className="eyebrow">{items.length} {items.length === 1 ? 'style' : 'styles'}</span>
                    <strong>{t}</strong>
                    <span className="type-tile-cta">Shop now</span>
                  </span>
                </button>
              </Reveal>
            );
          })}
        </section>
      )}

      <div className="container page" id="collection">
        <Reveal className="section-title">
          <p className="eyebrow">{settings.store_name}</p>
          <h2>{type || 'The collection'}</h2>
        </Reveal>

        <div className="toolbar">
          <label className="select-pill">
            <span>Product</span>
            <select value={type} onChange={(e) => update('type', e.target.value)}>
              <option value="">All products</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {bands.length > 0 && (
            <label className="select-pill">
              <span>Price</span>
              <select value={band ? priceKey : ''} onChange={(e) => update('price', e.target.value)}>
                <option value="">All prices</option>
                {bands.map((b, i) => (
                  <option key={b.label} value={String(i)}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="select-pill">
            <span>Sort</span>
            <select value={sort} onChange={(e) => update('sort', e.target.value === 'featured' ? '' : e.target.value)}>
              {(Object.keys(SORTS) as Sort[]).map((s) => (
                <option key={s} value={s}>
                  {SORTS[s]}
                </option>
              ))}
            </select>
          </label>
          <span className="toolbar-count">
            {visible.length} {visible.length === 1 ? 'item' : 'items'}
            {filtered && (
              <button type="button" className="link-btn" onClick={() => setParams({}, { replace: true, preventScrollReset: true })}>
                Clear filters
              </button>
            )}
          </span>
        </div>

        {loading && <p className="muted center">Loading products…</p>}
        {error && <p className="error center">{error}</p>}
        {!loading && !error && visible.length === 0 && (
          <div className="empty">
            <h2>{filtered ? 'Nothing matches those filters' : 'New collection coming soon'}</h2>
            <p className="muted">{filtered ? 'Try another product type or price.' : 'Check back shortly.'}</p>
          </div>
        )}

        <div className="grid">
          {visible.map((p, i) => (
            <Reveal key={p.id} delay={(i % 4) * 90}>
              <ProductCard product={p} currency={settings.currency} />
            </Reveal>
          ))}
        </div>
      </div>
    </>
  );
}
