import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchAllProducts } from '../lib/api';
import { formatPrice, sortSizes, variantLabel } from '../lib/format';
import { createInvoice } from '../lib/invoices';
import { useStore } from '../lib/store';
import type { PaymentMethod, Product, ProductSize } from '../lib/types';

interface Line {
  key: number;
  productId: string;
  sizeId: string;
  qty: number;
  price: string;
}

let nextKey = 1;
const blankLine = (): Line => ({ key: nextKey++, productId: '', sizeId: '', qty: 1, price: '' });

/** Create an invoice for an order: pick each piece by product, colour and size, then create it to take them out of stock. */
export default function InvoiceNew() {
  const navigate = useNavigate();
  const { settings, reload: reloadShop } = useStore();
  const money = (n: number) => formatPrice(n, settings.currency);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '' });
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [payment, setPayment] = useState<PaymentMethod>('cod');
  const [paid, setPaid] = useState(false);
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [scan, setScan] = useState('');
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAllProducts()
      .then((p) => setProducts(p.sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load products'))
      .finally(() => setLoading(false));
  }, []);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const sizeById = useMemo(() => new Map(products.flatMap((p) => p.product_sizes.map((s) => [s.id, s] as const))), [products]);

  // Pieces already on this invoice for a variant, so stock limits count every line.
  const usedElsewhere = (sizeId: string, key: number) =>
    lines.filter((l) => l.sizeId === sizeId && l.key !== key).reduce((n, l) => n + l.qty, 0);
  const available = (s: ProductSize, key: number) => s.stock - usedElsewhere(s.id, key);

  function update(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function chooseProduct(key: number, productId: string) {
    const p = productById.get(productId);
    const inStock = p ? sortSizes(p.product_sizes).filter((s) => s.stock > 0) : [];
    update(key, {
      productId,
      // A product with a single size and colour in stock needs no second pick.
      sizeId: inStock.length === 1 ? inStock[0].id : '',
      qty: 1,
      price: p ? String(p.price) : '',
    });
  }

  /** Adds the variant whose barcode or SKU was scanned or typed, or one more of it if it's already on the invoice. */
  function addScanned(e: FormEvent) {
    e.preventDefault();
    const code = scan.trim().toUpperCase();
    if (!code) return;
    const size = products.flatMap((p) => p.product_sizes).find((s) => s.barcode === code || s.sku.toUpperCase() === code);
    if (!size) {
      setScanMsg(`No size or colour has the code ${scan.trim()}.`);
      return;
    }
    const product = productById.get(size.product_id)!;
    const existing = lines.find((l) => l.sizeId === size.id);
    if (existing) {
      update(existing.key, { qty: existing.qty + 1 });
    } else {
      const line = { ...blankLine(), productId: product.id, sizeId: size.id, price: String(product.price) };
      setLines((ls) => [...ls.filter((l) => l.productId), line]);
    }
    setScanMsg(`Added ${product.name} (${variantLabel(size)}).`);
    setScan('');
  }

  const filled = lines.filter((l) => l.sizeId);
  const subtotal = filled.reduce((n, l) => n + (Number(l.price) || 0) * l.qty, 0);
  const discountValue = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total = subtotal - discountValue;
  const pieces = filled.reduce((n, l) => n + l.qty, 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customer.name.trim()) return setError("Enter the customer's name.");
    if (!filled.length) return setError('Add at least one item.');
    for (const l of filled) {
      const s = sizeById.get(l.sizeId);
      const name = productById.get(l.productId)?.name ?? 'an item';
      if (!s) return setError(`Choose the size for ${name}.`);
      if (l.qty < 1) return setError(`Enter a quantity for ${name}.`);
      if (available(s, l.key) < l.qty) return setError(`Only ${Math.max(available(s, l.key), 0)} left of ${name} (${variantLabel(s)}).`);
    }
    if (lines.some((l) => l.productId && !l.sizeId)) return setError('Choose the colour and size for every item, or remove it.');

    setBusy(true);
    try {
      const id = await createInvoice({
        customer: { name: customer.name.trim(), phone: customer.phone.trim(), address: customer.address.trim() },
        items: filled.map((l) => ({ size_id: l.sizeId, qty: l.qty, unit_price: Number(l.price) || 0 })),
        payment,
        discount: discountValue,
        notes: notes.trim(),
        paid,
      });
      reloadShop();
      navigate(`/admin/invoices/${id}`, { state: { created: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the invoice');
      setBusy(false);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <form className="stack" onSubmit={submit}>
      <p className="small">
        <Link to="/admin/invoices">← All invoices</Link>
      </p>
      <h1 style={{ fontSize: '1.4rem' }}>New invoice</h1>

      <section className="panel">
        <h2>Customer</h2>
        <div className="form-grid">
          <label className="field">
            <span>Name *</span>
            <input className="input" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} required />
          </label>
          <label className="field">
            <span>Phone / WhatsApp</span>
            <input className="input" type="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="077 123 4567" />
          </label>
          <label className="field full">
            <span>Delivery address</span>
            <textarea className="input" rows={2} value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Items</h2>
        <div className="row invoice-scan">
          <input
            className="input"
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addScanned(e)}
            placeholder="Scan a barcode or type an SKU"
            aria-label="Scan a barcode or type an SKU"
          />
          <button type="button" className="btn btn-sm" onClick={addScanned}>
            Add
          </button>
        </div>
        {scanMsg && <p className="small muted" style={{ margin: 0 }}>{scanMsg}</p>}

        <div className="table-wrap">
          <table className="table invoice-lines">
            <thead>
              <tr>
                <th>Product</th>
                <th>Colour & size</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const p = productById.get(l.productId);
                const s = sizeById.get(l.sizeId);
                const max = s ? Math.max(available(s, l.key), 0) : undefined;
                return (
                  <tr key={l.key}>
                    <td>
                      <select className="input" value={l.productId} onChange={(e) => chooseProduct(l.key, e.target.value)} aria-label="Product">
                        <option value="">Choose a product…</option>
                        {products.map((pr) => (
                          <option key={pr.id} value={pr.id}>
                            {pr.name}
                            {pr.sku ? ` (${pr.sku})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="input"
                        value={l.sizeId}
                        disabled={!p}
                        onChange={(e) => update(l.key, { sizeId: e.target.value, qty: 1 })}
                        aria-label="Colour and size"
                      >
                        <option value="">{p ? 'Choose…' : '—'}</option>
                        {p &&
                          sortSizes(p.product_sizes).map((v) => {
                            const left = available(v, l.key);
                            return (
                              <option key={v.id} value={v.id} disabled={left < 1 && v.id !== l.sizeId}>
                                {variantLabel(v)} · {left > 0 ? `${left} in stock` : 'out of stock'}
                              </option>
                            );
                          })}
                      </select>
                    </td>
                    <td>
                      <input
                        className="input qty-input"
                        type="number"
                        min={1}
                        max={max}
                        value={l.qty}
                        disabled={!s}
                        onChange={(e) => update(l.key, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                        aria-label="Quantity"
                      />
                    </td>
                    <td>
                      <input
                        className="input price-input"
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.price}
                        disabled={!p}
                        onChange={(e) => update(l.key, { price: e.target.value })}
                        aria-label="Unit price"
                      />
                    </td>
                    <td className="nowrap">{s ? money((Number(l.price) || 0) * l.qty) : '—'}</td>
                    <td>
                      {lines.length > 1 && (
                        <button type="button" className="link-btn small" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <button type="button" className="btn btn-sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
            + Add another item
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Payment & totals</h2>
        <div className="form-grid">
          <label className="field">
            <span>Payment method</span>
            <select className="input" value={payment} onChange={(e) => setPayment(e.target.value as PaymentMethod)}>
              <option value="cod">Cash on Delivery</option>
              <option value="bank">Bank Transfer</option>
            </select>
          </label>
          <label className="field">
            <span>Discount ({settings.currency})</span>
            <input className="input" type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
          </label>
          <label className="field full">
            <span>Note on the invoice (optional)</span>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Exchange within 7 days with this invoice" />
          </label>
        </div>
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          <span>Payment already received</span>
        </label>

        <dl className="invoice-summary">
          <dt>
            Subtotal ({pieces} {pieces === 1 ? 'piece' : 'pieces'})
          </dt>
          <dd>{money(subtotal)}</dd>
          {discountValue > 0 && (
            <>
              <dt>Discount</dt>
              <dd>− {money(discountValue)}</dd>
            </>
          )}
          <dt>Delivery (island wide)</dt>
          <dd>FREE</dd>
          <dt className="grand">Total</dt>
          <dd className="grand">{money(total)}</dd>
        </dl>
      </section>

      {error && <p className="error">{error}</p>}
      <p className="small muted" style={{ margin: 0 }}>
        Creating the invoice takes {pieces} {pieces === 1 ? 'piece' : 'pieces'} out of stock and records it in the inventory log. If you cancel the
        invoice later, they go back into stock.
      </p>
      <div className="row">
        <button className="btn btn-gold" disabled={busy}>
          {busy ? 'Creating…' : 'Create invoice'}
        </button>
        <Link to="/admin/invoices" className="btn">
          Cancel
        </Link>
      </div>
    </form>
  );
}
