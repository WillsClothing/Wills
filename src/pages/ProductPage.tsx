import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isSoldOut } from '../components/ProductCard';
import { sizeInCart, useCart } from '../lib/cart';
import { isLight } from '../lib/colors';
import { formatPrice, sortSizes } from '../lib/format';
import FreeDelivery from '../components/FreeDelivery';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

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

  useEffect(() => {
    setImageIndex(0);
    setSizeId(null);
    setQuantity(1);
    setColor(product?.colors.length === 1 ? product.colors[0].name : null);
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

  function addToCart() {
    if (!product || !selected || needsColor || quantity < 1 || quantity > maxAddable) return;
    cart.add({ productId: product.id, sizeId: selected.id, size: selected.size, color: color ?? undefined, quantity });
    setAdded(true);
    setQuantity(1);
    setTimeout(() => setAdded(false), 2500);
  }

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
        <div>
          <div className="gallery-main">
            {images.length ? (
              <img src={images[imageIndex]} alt={product.name} />
            ) : (
              <div className="img-placeholder">No image</div>
            )}
          </div>
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
        </div>

        <div className="stack">
          <div>
            {product.category && <p className="small caps muted">{product.category}</p>}
            <h1>{product.name}</h1>
            <div className="price-lg">{formatPrice(product.price, settings.currency)}</div>
          </div>
          <FreeDelivery variant="strip" />

          {soldOut ? (
            <div className="notice">This product is currently sold out.</div>
          ) : (
            <>
              {product.colors.length > 0 && (
                <div>
                  <p className="small caps" style={{ fontWeight: 500, marginBottom: 8 }}>
                    Colour {color && <span className="muted">· {color}</span>}
                  </p>
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

              <div>
                <p className="small caps" style={{ fontWeight: 500, marginBottom: 8 }}>
                  Size {selected && <span className="muted">· {selected.size}</span>}
                </p>
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
                  <p className="small muted" style={{ marginTop: 8 }}>
                    {selected.stock <= 3 ? `Only ${selected.stock} left` : `${selected.stock} in stock`}
                    {inCart > 0 && ` · ${inCart} already in your cart`}
                  </p>
                )}
              </div>

              <div>
                <p className="small caps" style={{ fontWeight: 500, marginBottom: 8 }}>
                  Quantity
                </p>
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
              </div>

              <div className="stack">
                <button className="btn btn-block" disabled={!selected || needsColor || maxAddable < 1} onClick={addToCart}>
                  {needsColor ? 'Select a colour' : !selected ? 'Select a size' : maxAddable < 1 ? 'Max quantity in cart' : 'Add to cart'}
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
              </div>
            </>
          )}

          {product.description && <p className="desc">{product.description}</p>}
        </div>
      </div>
    </div>
  );
}
