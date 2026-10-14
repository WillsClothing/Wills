import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ProductCard, { isSoldOut } from '../components/ProductCard';
import SizeGuide from '../components/SizeGuide';
import { sizeInCart, useCart } from '../lib/cart';
import { isLight } from '../lib/colors';
import { formatPrice, sortSizes } from '../lib/format';
import { TruckIcon } from '../components/FreeDelivery';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import type { Product } from '../lib/types';
import { whatsappLink } from '../lib/whatsapp';

export default function ProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { products, settings, loading } = useStore();
  const cart = useCart();
  const product = products.find((p) => p.id === id);

  const [imageIndex, setImageIndex] = useState(0);
  const [sizeId, setSizeId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [color, setColor] = useState<string | null>(null);
  // Signed-in admins get a shortcut back to the editor (customers never sign in, so they never see it).
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);
  const [added, setAdded] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    setImageIndex(0);
    setSizeId(null);
    setQuantity(1);
    setColor(product?.colors.length === 1 ? product.colors[0].name : null);
    setGuideOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, product?.colors.length]);

  if (!product) {
    return (
      <div className="container page empty">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <h1>Product not found</h1>
            <p className="muted">It may have been removed or is no longer available.</p>
            <Link to="/" className="btn">
              Back to shop
            </Link>
          </>
        )}
      </div>
    );
  }

  const allSizes = sortSizes(product.product_sizes);
  // Stock is kept per size + colour. Older products may have colours without per-colour stock.
  const perColor = allSizes.some((s) => s.color);
  const rowsFor = (c: string | null) => (perColor ? allSizes.filter((s) => s.color === c) : allSizes);
  const colorInStock = (c: string) => rowsFor(c).some((s) => s.stock > 0);
  const sizes = product.colors.length && perColor && !color ? [] : rowsFor(color);
  const soldOut = isSoldOut(product);
  const selected = sizes.find((s) => s.id === sizeId);
  const inCart = sizeId ? sizeInCart(cart.items, sizeId) : 0;
  const needsColor = product.colors.length > 0 && !color;
  const maxAddable = selected ? Math.max(0, selected.stock - inCart) : 0;
  const images = product.images.length ? product.images : [];

  const canAdd = !!selected && !needsColor && maxAddable >= 1;

  function addToCart(buyNow = false) {
    if (!product || !selected || needsColor || quantity < 1 || quantity > maxAddable) return;
    cart.add({ productId: product.id, sizeId: selected.id, size: selected.size, color: color ?? undefined, quantity });
    if (buyNow) {
      navigate('/cart');
      return;
    }
    setAdded(true);
    setQuantity(1);
    setTimeout(() => setAdded(false), 2500);
  }

  const intro = introOf(product.description);
  const related = styleWith(product, products);
  const waHref = settings.whatsapp_number
    ? whatsappLink(settings.whatsapp_number, `Hi ${settings.store_name}, I have a question about ${product.name}.`)
    : '';

  return (
    <div className="container page">
      <p className="small muted" style={{ marginBottom: 20 }}>
        <Link to="/">Shop</Link> / {product.name}
        {signedIn && (
          <Link to={`/admin/products/${product.id}`} className="admin-edit-link">
            Edit product
          </Link>
        )}
      </p>
      <div className="product">
        <div className={`pdp-gallery ${images.length > 1 ? 'has-thumbs' : ''}`}>
          {images.length > 1 && (
            <div className="thumbs">
              {images.map((src, i) => (
                <button
                  key={src}
                  className={i === imageIndex ? 'active' : ''}
                  onClick={() => setImageIndex(i)}
                  aria-label={`Image ${i + 1}`}
                >
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}
          <div className="gallery-main">
            {images.length ? (
              <img src={images[imageIndex]} alt={product.name} />
            ) : (
              <div className="img-placeholder">No image</div>
            )}
          </div>
        </div>

        <div className="pdp-info">
          {product.category && <p className="small caps muted pdp-eyebrow">{product.category}</p>}
          <h1>{product.name}</h1>
          <div className="price-lg">{formatPrice(product.price, settings.currency)}</div>
          {intro && <p className="pdp-intro">{intro}</p>}

          {soldOut ? (
            <div className="notice">This product is currently sold out.</div>
          ) : (
            <>
              {product.colors.length > 0 && (
                <div className="pdp-option">
                  <div className="pdp-option-head">
                    <span>
                      <strong>Colour:</strong> {color ?? <span className="muted">choose one</span>}
                    </span>
                    {product.colors.length > 1 && <span className="muted">{product.colors.length} colours</span>}
                  </div>
                  <div className="color-pick">
                    {product.colors.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        className={`${color === c.name ? 'active' : ''} ${colorInStock(c.name) ? '' : 'out'}`}
                        disabled={!colorInStock(c.name)}
                        onClick={() => {
                          setColor(c.name);
                          // Keep the same size if it exists in the new colour.
                          const same = perColor ? rowsFor(c.name).find((r) => r.size === selected?.size && r.stock > 0) : selected;
                          setSizeId(same?.id ?? null);
                          setQuantity(1);
                        }}
                        title={colorInStock(c.name) ? c.name : `${c.name} (sold out)`}
                        aria-label={c.name}
                        aria-pressed={color === c.name}
                      >
                        <span className={`swatch ${isLight(c.hex) ? 'light' : ''}`} style={{ background: c.hex }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pdp-option">
                <div className="pdp-option-head">
                  <span>
                    <strong>Size:</strong> {selected ? selected.size : <span className="muted">choose one</span>}
                  </span>
                  {product.size_chart && (
                    <button type="button" className="link-btn pdp-guide-link" onClick={() => setGuideOpen(true)}>
                      <RulerIcon /> Size &amp; fit guide
                    </button>
                  )}
                </div>
                {sizes.length === 0 && <p className="small muted" style={{ margin: 0 }}>Choose a colour to see the sizes in stock.</p>}
                <div className="sizes">
                  {sizes.map((s) => (
                    <button
                      key={s.id}
                      className={`size-btn ${s.id === sizeId ? 'active' : ''}`}
                      disabled={s.stock === 0}
                      onClick={() => {
                        setSizeId(s.id);
                        setQuantity(1);
                      }}
                      title={s.stock === 0 ? 'Out of stock' : `${s.stock} available`}
                    >
                      {s.size}
                    </button>
                  ))}
                </div>
                {selected && (
                  <p className="small muted" style={{ margin: '8px 0 0' }}>
                    {selected.stock <= 3 ? `Only ${selected.stock} left` : `${selected.stock} in stock`}
                    {inCart > 0 && ` · ${inCart} already in your cart`}
                  </p>
                )}
              </div>

              <div className="pdp-buy">
                <div className="qty">
                  <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="Decrease">
                    −
                  </button>
                  <span>{quantity}</span>
                  <button
                    onClick={() => setQuantity((q) => q + 1)}
                    disabled={!selected || quantity >= maxAddable}
                    aria-label="Increase"
                  >
                    +
                  </button>
                </div>
                <button className="btn pdp-add" disabled={!canAdd} onClick={() => addToCart()}>
                  {needsColor ? 'Select a colour' : !selected ? 'Select a size' : maxAddable < 1 ? 'Max quantity in cart' : 'Add to cart'}
                </button>
              </div>
              <button className="btn btn-gold btn-block pdp-now" disabled={!canAdd} onClick={() => addToCart(true)}>
                Buy it now
              </button>
              {added && (
                <div className="notice row">
                  <span>Added to your cart.</span>
                  <span className="spacer" />
                  <button className="btn btn-sm" onClick={() => navigate('/cart')}>
                    View cart
                  </button>
                </div>
              )}
            </>
          )}

          <ul className="pdp-perks">
            <li className="gold">
              <TruckIcon />
              <span>
                Island wide
                <br />
                free delivery
              </span>
            </li>
            <li>
              <ClockIcon />
              <span>
                Delivered in
                <br />3 to 4 working days
              </span>
            </li>
            <li>
              <CashIcon />
              <span>
                Cash on delivery
                <br />
                or bank transfer
              </span>
            </li>
            <li>
              <ChatIcon />
              <span>
                WhatsApp support
                <br />
                {waHref ? (
                  <a href={waHref} target="_blank" rel="noreferrer">
                    Chat with us
                  </a>
                ) : (
                  'Chat with us'
                )}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="pdp-accordions">
        {product.description && (
          <Accordion title="Description">
            <p className="desc">{product.description}</p>
          </Accordion>
        )}
        <Accordion title="Fit & Sizing">
          {product.size_chart?.note && <p>{product.size_chart.note}</p>}
          {product.size_chart ? (
            <button type="button" className="btn btn-sm" onClick={() => setGuideOpen(true)}>
              <RulerIcon /> Size guide
            </button>
          ) : (
            <p>
              Not sure which size to pick?{' '}
              {waHref ? (
                <a href={waHref} target="_blank" rel="noreferrer">
                  Message us on WhatsApp
                </a>
              ) : (
                'Message us on WhatsApp'
              )}{' '}
              and we will help.
            </p>
          )}
        </Accordion>
        <Accordion title="Delivery">
          <p className="pdp-delivery-time">3 to 4 working days</p>
          <p className="muted">Free delivery island wide, to your door anywhere in Sri Lanka.</p>
        </Accordion>
      </div>

      {related.length > 0 && (
        <section className="pdp-related">
          <h2>Style with</h2>
          <div className="grid">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} currency={settings.currency} />
            ))}
          </div>
        </section>
      )}

      {guideOpen && product.size_chart && (
        <SizeGuide chart={product.size_chart} name={product.name} selectedSize={selected?.size} onClose={() => setGuideOpen(false)} />
      )}
    </div>
  );
}

/** The first paragraph of the description, shortened to a sentence or two for the top of the page. */
function introOf(description: string): string {
  const first = description.trim().split(/\n\s*\n/)[0].replace(/\s+/g, ' ');
  if (first.length <= 220) return first;
  const cut = first.slice(0, 220);
  const end = cut.lastIndexOf('. ');
  return end > 80 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** Up to four other products to wear with this one: other product types first, then the rest, in shop order. */
function styleWith(product: Product, all: Product[]): Product[] {
  const others = all.filter((p) => p.id !== product.id && !isSoldOut(p));
  const pairs = others.filter((p) => p.category !== product.category);
  const same = others.filter((p) => p.category === product.category);
  return [...pairs.slice(0, 2), ...same, ...pairs.slice(2)].slice(0, 4);
}

function Accordion({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`pdp-acc ${open ? 'open' : ''}`}>
      <button type="button" className="pdp-acc-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <span className="pdp-acc-icon" aria-hidden="true" />
      </button>
      <div className="pdp-acc-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function RulerIcon() {
  return (
    <svg {...iconProps} className="pdp-icon-sm">
      <path d="M3 15.5 15.5 3 21 8.5 8.5 21z M7 12l2 2 M10 9l2 2 M13 6l2 2" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}
function CashIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2.5" y="6" width="19" height="12" rx="1.5" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5v5 M18 9.5v5" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 18.5 5.2 15A7.5 7.5 0 1 1 9 18.3z" />
    </svg>
  );
}
