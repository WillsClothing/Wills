import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { formatPrice, sortSizes } from '../lib/format';
import { useStore } from '../lib/store';
import { isLight } from '../lib/colors';
import type { Product, ProductSize, Promotion } from '../lib/types';
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
  const canClaim = Boolean(settings.whatsapp_number);
  const ends = promo.ends_on
    ? new Date(`${promo.ends_on}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
    : '';
  return { money, items, lines, lineText, usual, save, pictures, label, canClaim, ends };
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
const CLAIM_EVENT = 'wills:claim-offer';
const openClaim = (id: string) => window.dispatchEvent(new CustomEvent<string>(CLAIM_EVENT, { detail: id }));

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
          {o.canClaim && (
            <button type="button" className="btn btn-gold btn-sm" onClick={() => openClaim(promo.id)}>
              <WhatsAppIcon size={16} /> Claim offer
            </button>
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
  const [claimId, setClaimId] = useState<string | null>(null);
  const { pathname } = useLocation();
  const claiming = promotions.find((p) => p.id === claimId);

  useEffect(() => {
    const claim = (e: Event) => setClaimId((e as CustomEvent<string>).detail);
    window.addEventListener(CLAIM_EVENT, claim);
    return () => window.removeEventListener(CLAIM_EVENT, claim);
  }, []);

  useEffect(() => setClaimId(null), [pathname]);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !claimId && setOpen(false);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, claimId]);

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
      {claiming && (
        <ClaimSheet
          key={claiming.id}
          promo={claiming}
          products={products}
          onClose={() => setClaimId(null)}
          onSent={() => {
            setClaimId(null);
            setOpen(false);
          }}
        />
      )}
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
          {o.canClaim && (
            <button
              type="button"
              className="btn btn-gold"
              onClick={() => {
                onClose();
                openClaim(promo.id);
              }}
            >
              <WhatsAppIcon size={18} /> Claim offer
            </button>
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

interface PiecePick {
  color: string | null;
  sizeId: string | null;
}

/**
 * Claiming an offer: the customer picks a size (and colour, where the product has colours) for every piece
 * before WhatsApp opens, so no offer order arrives without sizes. Each piece of a "2 tees" combo is picked on its own.
 */
function ClaimSheet({ promo, products, onClose, onSent }: { promo: Promotion; products: Product[]; onClose: () => void; onSent: () => void }) {
  const { settings } = useStore();
  const o = useOffer(promo, products);
  const pieces = o.items;
  const [picks, setPicks] = useState<PiecePick[]>(() =>
    pieces.map((p) => ({ color: p.colors.length === 1 ? p.colors[0].name : null, sizeId: null })),
  );
  // Offers saved without products: the customer still has to say which sizes they want.
  const [typedSizes, setTypedSizes] = useState('');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const perColor = (p: Product) => p.product_sizes.some((s) => s.color);
  const rowsFor = (p: Product, color: string | null): ProductSize[] =>
    sortSizes(perColor(p) ? p.product_sizes.filter((s) => s.color === color) : p.product_sizes);
  // Stock left for a variant once the other pieces of this offer have taken theirs.
  const left = (row: ProductSize, piece: number) =>
    row.stock - picks.filter((pk, i) => i !== piece && pk.sizeId === row.id).length;
  const soldOut = (p: Product) => p.status !== 'available' || !p.product_sizes.some((s) => s.stock > 0);

  const needsColor = (p: Product, pk: PiecePick) => p.colors.length > 0 && !pk.color;
  const chosen = (p: Product, pk: PiecePick) => p.product_sizes.find((s) => s.id === pk.sizeId);
  const pieceDone = (i: number) => !needsColor(pieces[i], picks[i]) && !!chosen(pieces[i], picks[i]);
  const anySoldOut = pieces.some(soldOut);
  const ready = pieces.length ? !anySoldOut && pieces.every((_, i) => pieceDone(i)) : typedSizes.trim().length > 0;
  const missing = pieces.filter((_, i) => !pieceDone(i)).length;

  const pieceLabel = (p: Product, i: number) => {
    const total = pieces.filter((x) => x === p).length;
    if (total < 2) return p.name;
    const n = pieces.slice(0, i + 1).filter((x) => x === p).length;
    return `${p.name} (piece ${n} of ${total})`;
  };

  function setPick(i: number, next: Partial<PiecePick>) {
    setPicks((all) => all.map((pk, n) => (n === i ? { ...pk, ...next } : pk)));
  }

  function message(): string {
    const lines = pieces.length
      ? pieces.map((p, i) => {
          const row = chosen(p, picks[i]);
          const colour = picks[i].color ? `Colour: ${picks[i].color} | ` : '';
          return `${i + 1}. ${p.name}\n   ${colour}Size: ${row?.size ?? ''}`;
        })
      : [`Sizes: ${typedSizes.trim()}`];
    return [
      `Hello ${settings.store_name}, I'd like the "${promo.title}" ${o.label.toLowerCase()} (${o.money(promo.price)}).`,
      '',
      ...lines,
      '',
      'Delivery: FREE (island wide)',
      `*Total: ${o.money(promo.price)}*`,
    ].join('\n');
  }

  function send() {
    setTried(true);
    if (!ready || !settings.whatsapp_number) return;
    window.open(whatsappLink(settings.whatsapp_number, message()), '_blank', 'noopener');
    onSent();
  }

  return (
    <div className="modal-backdrop claim-backdrop" onClick={onClose}>
      <div className="modal claim-sheet" role="dialog" aria-modal="true" aria-labelledby="claim-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="offer-pop-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">{o.label}</p>
        <h2 id="claim-title">{promo.title}</h2>
        <p className="small muted">
          Choose a size{pieces.some((p) => p.colors.length) ? ' and colour' : ''} {pieces.length > 1 ? 'for each item' : 'to order'}. Island wide
          free delivery.
        </p>

        {pieces.length === 0 && (
          <label className="claim-piece">
            <strong>Your size(s)</strong>
            <input value={typedSizes} onChange={(e) => setTypedSizes(e.target.value)} placeholder="e.g. M and L" />
          </label>
        )}

        {pieces.map((p, i) => {
          const pk = picks[i];
          const sizes = needsColor(p, pk) && perColor(p) ? [] : rowsFor(p, pk.color);
          const row = chosen(p, pk);
          const colorInStock = (c: string) => rowsFor(p, c).some((r) => left(r, i) > 0);
          const flag = tried && !pieceDone(i);
          return (
            <div key={i} className={`claim-piece ${flag ? 'flag' : ''}`}>
              <div className="claim-piece-head">
                {p.images[0] && <img src={p.images[0]} alt="" />}
                <div>
                  <strong>{pieceLabel(p, i)}</strong>
                  <span className="small muted">
                    {soldOut(p)
                      ? 'Sold out'
                      : [pk.color, row && `Size ${row.size}`].filter(Boolean).join(' · ') || 'Not chosen yet'}
                  </span>
                </div>
              </div>
              {!soldOut(p) && p.colors.length > 0 && (
                <div className="color-pick">
                  {p.colors.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      className={`${pk.color === c.name ? 'active' : ''} ${colorInStock(c.name) ? '' : 'out'}`}
                      disabled={!colorInStock(c.name)}
                      onClick={() => {
                        const same = perColor(p) ? rowsFor(p, c.name).find((r) => r.size === row?.size && left(r, i) > 0) : row;
                        setPick(i, { color: c.name, sizeId: same?.id ?? null });
                      }}
                      title={colorInStock(c.name) ? c.name : `${c.name} (sold out)`}
                      aria-label={c.name}
                      aria-pressed={pk.color === c.name}
                    >
                      <span className={`swatch ${isLight(c.hex) ? 'light' : ''}`} style={{ background: c.hex }} />
                    </button>
                  ))}
                </div>
              )}
              {!soldOut(p) && sizes.length === 0 && <p className="small muted claim-hint">Choose a colour to see the sizes.</p>}
              {sizes.length > 0 && (
                <div className="sizes">
                  {sizes.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`size-btn ${s.id === pk.sizeId ? 'active' : ''}`}
                      disabled={s.id !== pk.sizeId && left(s, i) <= 0}
                      onClick={() => setPick(i, { sizeId: s.id })}
                      aria-pressed={s.id === pk.sizeId}
                    >
                      {s.size}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {anySoldOut && <p className="claim-error">An item in this offer is sold out right now. Message us on WhatsApp for an alternative.</p>}
        {tried && !ready && !anySoldOut && (
          <p className="claim-error">
            {pieces.length ? `Please choose a size${pieces.some((p) => p.colors.length) ? ' and colour' : ''} for ${missing === 1 ? 'the item marked' : `the ${missing} items marked`}.` : 'Please type the size(s) you want.'}
          </p>
        )}
        <div className="claim-total">
          <span>Total</span>
          <strong>{o.money(promo.price)}</strong>
        </div>
        <button type="button" className="btn btn-gold btn-block" onClick={send} aria-disabled={!ready} disabled={anySoldOut}>
          <WhatsAppIcon size={18} /> {ready ? 'Order on WhatsApp' : pieces.length > 1 ? 'Choose sizes to order' : 'Choose a size to order'}
        </button>
      </div>
    </div>
  );
}
