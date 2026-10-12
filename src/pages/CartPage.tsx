import { useState } from 'react';
import { Link } from 'react-router-dom';
import WhatsAppIcon from '../components/WhatsAppIcon';
import { resolveCart, useCart } from '../lib/cart';
import { formatPrice } from '../lib/format';
import { useStore } from '../lib/store';
import type { PaymentMethod } from '../lib/types';
import { buildOrderMessage, PAYMENT_LABELS, whatsappLink, type CustomerDetails } from '../lib/whatsapp';

export default function CartPage() {
  const cart = useCart();
  const { products, settings, loading } = useStore();
  const [payment, setPayment] = useState<PaymentMethod>('cod');
  const [customer, setCustomer] = useState<CustomerDetails>({ name: '', phone: '', address: '', notes: '' });
  const [sent, setSent] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const items = resolveCart(cart.items, products);
  const total = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const problems = loading ? [] : items.filter((i) => !i.orderable);
  const missing = (['name', 'phone', 'address'] as const).filter((k) => !customer[k].trim());
  const hasNumber = Boolean(settings.whatsapp_number);

  function update<K extends keyof CustomerDetails>(key: K, value: string) {
    setCustomer((c) => ({ ...c, [key]: value }));
  }

  function placeOrder() {
    if (missing.length) {
      setShowErrors(true);
      return;
    }
    if (problems.length || !hasNumber) return;
    const message = buildOrderMessage(items, payment, customer, settings);
    window.open(whatsappLink(settings.whatsapp_number, message), '_blank', 'noopener');
    setSent(true);
  }

  if (cart.items.length === 0) {
    return (
      <div className="container page empty">
        <h1>Your cart is empty</h1>
        <p className="muted">Browse the collection and add something you like.</p>
        <Link to="/" className="btn">
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="container page">
      <h1 className="caps" style={{ fontSize: '1.3rem', marginBottom: 24 }}>
        Your cart
      </h1>
      <div className="cart-layout">
        <div>
          {items.map((item) => {
            const cover = item.product?.images[0];
            return (
              <div className="cart-item" key={item.sizeId}>
                <Link to={`/product/${item.productId}`} className="thumb">
                  {cover ? <img src={cover} alt="" /> : <div className="img-placeholder">—</div>}
                </Link>
                <div className="stack" style={{ minWidth: 0 }}>
                  <div>
                    <strong>{item.product?.name ?? 'No longer available'}</strong>
                    <div className="small muted">
                      Size {item.size} · {formatPrice(item.product?.price ?? 0, settings.currency)}
                    </div>
                    {!loading && !item.orderable && (
                      <div className="small error">
                        {item.available === 0
                          ? 'Out of stock. Please remove this item.'
                          : `Only ${item.available} available. Please lower the quantity.`}
                      </div>
                    )}
                  </div>
                  <div className="row">
                    <div className="qty">
                      <button
                        onClick={() => cart.setQuantity(item.sizeId, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                        aria-label="Decrease"
                      >
                        −
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        onClick={() => cart.setQuantity(item.sizeId, item.quantity + 1)}
                        disabled={item.quantity >= item.available}
                        aria-label="Increase"
                      >
                        +
                      </button>
                    </div>
                    <button className="link-btn small" onClick={() => cart.remove(item.sizeId)}>
                      Remove
                    </button>
                  </div>
                </div>
                <div className="line-total" style={{ fontWeight: 600 }}>
                  {formatPrice(item.lineTotal, settings.currency)}
                </div>
              </div>
            );
          })}
          <p style={{ marginTop: 16 }}>
            <Link to="/" className="small">
              ← Continue shopping
            </Link>
          </p>
        </div>

        <aside className="summary stack">
          <h2 className="caps" style={{ fontSize: '0.9rem' }}>
            Order summary
          </h2>
          <div>
            {items.map((i) => (
              <div className="summary-row small" key={i.sizeId}>
                <span>
                  {i.product?.name} ({i.size}) × {i.quantity}
                </span>
                <span>{formatPrice(i.lineTotal, settings.currency)}</span>
              </div>
            ))}
            <div className="summary-row summary-total">
              <span>Total</span>
              <span>{formatPrice(total, settings.currency)}</span>
            </div>
          </div>

          <div>
            <p className="small caps" style={{ fontWeight: 600, marginBottom: 8 }}>
              Payment method
            </p>
            <div className="pay-options">
              {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                <label key={m} className={`pay-option ${payment === m ? 'active' : ''}`}>
                  <input type="radio" name="payment" checked={payment === m} onChange={() => setPayment(m)} />
                  <span>
                    <strong>{PAYMENT_LABELS[m]}</strong>
                    <span className="small muted" style={{ display: 'block' }}>
                      {m === 'cod' ? 'Pay in cash when your order arrives.' : 'Transfer to our bank account and send the receipt on WhatsApp.'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {payment === 'bank' && (
              <div style={{ marginTop: 12 }}>
                <p className="small" style={{ marginBottom: 6 }}>
                  Bank details
                </p>
                <div className="bank-box">
                  {settings.bank_details || 'Bank details will be shared on WhatsApp.'}
                </div>
              </div>
            )}
          </div>

          <div className="stack">
            <p className="small caps" style={{ fontWeight: 600, margin: 0 }}>
              Delivery details
            </p>
            <label className="field">
              <span>Full name *</span>
              <input className="input" value={customer.name} onChange={(e) => update('name', e.target.value)} autoComplete="name" />
            </label>
            <label className="field">
              <span>Phone *</span>
              <input className="input" type="tel" value={customer.phone} onChange={(e) => update('phone', e.target.value)} autoComplete="tel" />
            </label>
            <label className="field">
              <span>Delivery address *</span>
              <textarea className="input" value={customer.address} onChange={(e) => update('address', e.target.value)} autoComplete="street-address" />
            </label>
            <label className="field">
              <span>Notes (optional)</span>
              <input className="input" value={customer.notes} onChange={(e) => update('notes', e.target.value)} />
            </label>
            {showErrors && missing.length > 0 && (
              <p className="small error">Please fill in your name, phone and delivery address.</p>
            )}
          </div>

          {problems.length > 0 && (
            <p className="small error">Some items are no longer available in that quantity. Please update your cart.</p>
          )}
          {!hasNumber && <p className="small error">Online ordering is not set up yet. Please check back soon.</p>}

          <button className="btn btn-block" onClick={placeOrder} disabled={problems.length > 0 || !hasNumber || loading}>
            <WhatsAppIcon /> Place order on WhatsApp
          </button>
          <p className="small muted" style={{ margin: 0 }}>
            Your order is sent to us on WhatsApp, where we confirm availability and delivery. No online payment is needed.
          </p>

          {sent && (
            <div className="notice stack">
              <span>WhatsApp should have opened with your order. Once you have sent the message, you can clear your cart.</span>
              <button className="btn btn-outline btn-sm" onClick={() => cart.clear()}>
                Clear cart
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
