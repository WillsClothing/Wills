import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { formatPrice } from '../lib/format';
import { useStore } from '../lib/store';
import type { Product, Promotion } from '../lib/types';
import { whatsappLink } from '../lib/whatsapp';
import WhatsAppIcon from './WhatsAppIcon';

/** Everything the shop needs to show one offer. */
function useOffer(promo: Promotion, products: Product[]) {
  const { settings } = useStore();
  const money = (n: number) => formatPrice(n, settings.currency);
  const items = promo.product_ids.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p);
  const usual = promo.compare_price ?? (items.length ? items.reduce((s, p) => s + p.price, 0) : null);
  const save = usual && usual > promo.price ? Math.round(((usual - promo.price) / usual) * 100) : 0;
  // A product can appear more than once in a combo ("2 tees"), so group it with a count for display.
  const lines = [...new Set(items)].map((p) => ({ product: p, qty: items.filter((x) => x === p).length }));
  const lineText = ({ product, qty }: { product: Product; qty: number }) => (qty > 1 ? `${qty} × ${product.name}` : product.name);
  const pictures = promo.image ? [promo.image] : lines.map((l) => l.product.images[0]).filter(Boolean).slice(0, 3);
  const label = promo.kind === 'special' ? 'Special offer' : 'Combo offer';
  const message = [
    `Hello ${settings.store_name}, I'd like the "${promo.title}" ${label.toLowerCase()} (${money(promo.price)}).`,
    lines.length ? `Items: ${lines.map(lineText).join(' + ')}` : '',
    'Delivery: FREE (island wide)',
    'My sizes: ',
  ]
    .filter(Boolean)
    .join('\n');
  const claim = settings.whatsapp_number ? whatsappLink(settings.whatsapp_number, message) : '';
  const ends = promo.ends_on
    ? new Date(`${promo.ends_on}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
    : '';
  return { money, lines, lineText, usual, save, pictures, label, claim, ends };
}

function OfferMedia({ pictures, title, save }: { pictures: string[]; title: string; save: number }) {
  return (
    <div className={`offer-media n${pictures.length}`}>
      {pictures.length ? pictures.map((src) => <img key={src} src={src} alt="" />) : <span className="offer-mono">{title.slice(0, 1)}</span>}
      {save > 0 && <span className="offer-save">Save {save}%</span>}
    </div>
  );
}

const OPEN_EVENT = 'wills:open-offers';
export const openOffers = () => window.dispatchEvent(new Event(OPEN_EVENT));

function DrawerCard({ promo, products }: { promo: Promotion; products: Product[] }) {
  const o = useOffer(promo, products);
  return (
    <article className="dock-card">
      <OfferMedia pictures={o.pictures} title={promo.title} save={o.save} />
      <div className="dock-card-body">
        <p className="spot-kind">{o.label}</p>
        <h3>{promo.title}</h3>
        {promo.description && <p className="spot-desc">{promo.description}</p>}
        {o.lines.length > 0 && (
          <ul className="offer-items">
            {o.lines.map((l) => (
              <li key={l.product.id}>
                <Link to={`/product/${l.product.id}`}>{o.lineText(l)}</Link>
              </li>
            ))}
          </ul>
        )}
        <div className="offer-price">
          <strong>{o.money(promo.price)}</strong>
          {o.save > 0 && <s>{o.money(o.usual!)}</s>}
        </div>
        <div className="spot-actions">
          {o.claim && (
            <a className="btn btn-gold btn-sm" href={o.claim} target="_blank" rel="noreferrer">
              <WhatsAppIcon size={16} /> Claim offer
            </a>
          )}
          {o.ends && <span className="offer-ends">Ends {o.ends}</span>}
        </div>
      </div>
    </article>
  );
}

/**
 * A gold "Offers" tab pinned to the left edge of every shop page. It opens a drawer listing every live offer,
 * so offers are always one tap away without changing the page itself.
 */
export function OfferDock({ promotions, products }: { promotions: Promotion[]; products: Product[] }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return createPortal(
    <>
      <button type="button" className={`offer-tab ${open ? 'hide' : ''}`} onClick={() => setOpen(true)} aria-label={`See ${promotions.length} offers`}>
        <span className="offer-tab-count">{promotions.length}</span>
        <span className="offer-tab-text">{promotions.length === 1 ? 'Offer' : 'Offers'}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 12V4h8l10 10-8 8L3 12z M7.5 8.5h.01" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </button>
      <div className={`offer-drawer-wrap ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="offer-drawer-backdrop" onClick={() => setOpen(false)} />
        <aside className="offer-drawer" role="dialog" aria-modal="true" aria-label="Current offers">
          <header className="offer-drawer-head">
            <div>
              <p className="spot-kind">Limited time</p>
              <h2>Offers</h2>
            </div>
            <button type="button" className="offer-pop-close" aria-label="Close" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>
          {open && (
            <div className="offer-drawer-list">
              {promotions.map((promo) => (
                <DrawerCard key={promo.id} promo={promo} products={products} />
              ))}
            </div>
          )}
        </aside>
      </div>
    </>,
    document.body,
  );
}

const SEEN_KEY = 'wills-offers-seen';

function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Pops up once per visitor for each new set of offers, so the first thing they see is what's on promotion. */
export function OfferPopup({ promotions, products }: { promotions: Promotion[]; products: Product[] }) {
  const signature = promotions.map((p) => p.id).sort().join(',');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!signature || readSeen() === signature) return;
    const t = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(t);
  }, [signature]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function close() {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, signature);
    } catch {
      /* private mode: it will simply show again next visit */
    }
  }

  if (!open || !promotions[0]) return null;
  const promo = promotions[0];

  // Portalled to <body> so the page's fade-in transform can't trap the fixed overlay.
  return createPortal(
    <div className="offer-pop-backdrop" onClick={close}>
      <div className="offer-pop" role="dialog" aria-modal="true" aria-label={promo.title} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="offer-pop-close" aria-label="Close" onClick={close}>
          ×
        </button>
        <PopupBody promo={promo} products={products} more={promotions.length - 1} onClose={close} />
      </div>
    </div>,
    document.body,
  );
}

function PopupBody({ promo, products, more, onClose }: { promo: Promotion; products: Product[]; more: number; onClose: () => void }) {
  const o = useOffer(promo, products);
  return (
    <>
      <OfferMedia pictures={o.pictures} title={promo.title} save={o.save} />
      <div className="offer-pop-body">
        <p className="spot-kind">{o.label}</p>
        <h2>{promo.title}</h2>
        {promo.description && <p className="spot-desc">{promo.description}</p>}
        <div className="offer-price">
          <strong>{o.money(promo.price)}</strong>
          {o.save > 0 && <s>{o.money(o.usual!)}</s>}
        </div>
        <div className="spot-actions">
          {o.claim && (
            <a className="btn btn-gold" href={o.claim} target="_blank" rel="noreferrer" onClick={onClose}>
              <WhatsAppIcon size={18} /> Claim offer
            </a>
          )}
          <a
            className="link-btn small"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onClose();
              if (more > 0) openOffers();
            }}
          >
            {more > 0 ? `See all ${more + 1} offers` : 'Keep browsing'}
          </a>
        </div>
        {o.ends && <p className="offer-ends">Ends {o.ends}</p>}
      </div>
    </>
  );
}
