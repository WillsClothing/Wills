import { useCallback, useEffect, useMemo, useState } from 'react';
import { deletePromotion, fetchAllProducts, fetchAllPromotions, isLive, savePromotion, uploadImage, type PromotionInput } from '../lib/api';
import { formatPrice } from '../lib/format';
import { useStore } from '../lib/store';
import type { Product, Promotion, PromotionKind } from '../lib/types';
import { useAdmin } from './AdminLayout';

const EMPTY: PromotionInput = {
  kind: 'combo',
  title: '',
  description: '',
  price: 0,
  compare_price: null,
  product_ids: [],
  image: '',
  active: true,
  starts_on: null,
  ends_on: null,
  sort_order: 0,
};

function statusOf(p: Promotion): string {
  if (!p.active) return 'Off';
  return isLive(p) ? 'Showing' : 'Scheduled / ended';
}

export default function Promotions() {
  const { notify } = useAdmin();
  const { settings } = useStore();
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<PromotionInput>(EMPTY);
  const [price, setPrice] = useState('');
  const [comparePrice, setComparePrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const money = (n: number) => formatPrice(n, settings.currency);

  const load = useCallback(async () => {
    try {
      const [pr, p] = await Promise.all([fetchAllPromotions(), fetchAllProducts()]);
      setPromos(pr);
      setProducts(p);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load promotions';
      setError(
        /promotions/.test(msg) && /exist|schema cache/i.test(msg)
          ? 'The promotions table is not set up yet. Run supabase/promotions.sql in the Supabase SQL Editor, then refresh.'
          : msg,
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const itemsTotal = useMemo(
    () => form.product_ids.reduce((sum, id) => sum + (products.find((p) => p.id === id)?.price ?? 0), 0),
    [form.product_ids, products],
  );

  function open(p: Promotion | null) {
    setEditing(p ? p.id : 'new');
    const base = p ? { ...p } : { ...EMPTY };
    setForm(base);
    setPrice(p ? String(p.price) : '');
    setComparePrice(p?.compare_price != null ? String(p.compare_price) : '');
  }

  function toggleProduct(id: string) {
    setForm((f) => {
      const on = f.product_ids.includes(id);
      // A special offer is for one product, so picking another replaces it.
      if (f.kind === 'special') return { ...f, product_ids: on ? [] : [id] };
      return { ...f, product_ids: on ? f.product_ids.filter((x) => x !== id) : [...f.product_ids, id] };
    });
  }

  // A combo can hold the same product more than once ("2 tees for ..."): it is simply repeated in product_ids.
  function setQty(id: string, qty: number) {
    setForm((f) => ({ ...f, product_ids: [...f.product_ids.filter((x) => x !== id), ...Array<string>(Math.max(1, qty)).fill(id)] }));
  }

  const qtyOf = (id: string) => form.product_ids.filter((x) => x === id).length;

  function setKind(kind: PromotionKind) {
    setForm((f) => ({ ...f, kind, product_ids: kind === 'special' ? f.product_ids.slice(0, 1) : f.product_ids }));
  }

  async function onImage(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadImage(file);
      setForm((f) => ({ ...f, image: url }));
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const p = Number(price);
    if (!form.title.trim()) return notify('Give the offer a name');
    if (!price || !Number.isFinite(p) || p < 0) return notify('Enter the offer price');
    if (form.kind === 'combo' && form.product_ids.length < 2) return notify('A combo needs at least 2 pieces, e.g. 2 tees or a tee + shorts');
    if (form.kind === 'special' && form.product_ids.length !== 1) return notify('Pick the product this special offer is for');
    const cp = comparePrice.trim() ? Number(comparePrice) : itemsTotal || null;
    if (form.starts_on && form.ends_on && form.ends_on < form.starts_on) return notify('The end date must be after the start date');
    setBusy(true);
    try {
      const { id: _id, created_at: _c, ...rest } = form as Promotion;
      await savePromotion(editing === 'new' ? null : editing, {
        ...rest,
        title: form.title.trim(),
        description: form.description.trim(),
        price: p,
        compare_price: cp != null && Number.isFinite(cp) && cp > p ? cp : null,
      });
      notify('Offer saved');
      setEditing(null);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(p: Promotion) {
    try {
      const { id, created_at: _c, ...rest } = p;
      await savePromotion(id, { ...rest, active: !p.active });
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function remove(p: Promotion) {
    if (!confirm(`Delete the offer "${p.title}"?`)) return;
    try {
      await deletePromotion(p.id);
      notify('Offer deleted');
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Special &amp; combo offers</h1>
        {!editing && !error && (
          <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => open(null)}>
            + New offer
          </button>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Every offer that is switched on and inside its dates is the first thing customers see: a showcase at the very top of the
        shop and a pop-up when they arrive. With no offers running, both are hidden.
      </p>
      {error && <p className="error">{error}</p>}

      {editing && (
        <form className="promo-form stack" onSubmit={save}>
          <div className="field">
            <span className="small caps muted">Offer type</span>
            <div className="kind-pick">
              <button type="button" className={form.kind === 'combo' ? 'on' : ''} onClick={() => setKind('combo')}>
                <strong>Combo offer</strong>
                <small>2 or more pieces for one price, e.g. 2 tees or a tee + shorts</small>
              </button>
              <button type="button" className={form.kind === 'special' ? 'on' : ''} onClick={() => setKind('special')}>
                <strong>Special offer</strong>
                <small>A reduced price on one product</small>
              </button>
            </div>
          </div>

          <label className="field">
            <span>Offer name</span>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={form.kind === 'combo' ? 'Tee + Shorts combo' : 'Linen shirt, this week only'} />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={form.kind === 'combo' ? 'Any tee with any shorts. Pick your sizes on WhatsApp.' : 'This week only, while sizes last.'} />
          </label>

          <div className="field">
            <span className="small caps muted">{form.kind === 'combo'
                ? 'What is in this combo (2 or more pieces, use + for more than one of a product)'
                : 'Product on offer (pick one)'}</span>
            <div className="promo-products">
              {products.map((p) => (
                <div key={p.id} className={`promo-product ${qtyOf(p.id) ? 'on' : ''}`}>
                  <label>
                    <input type={form.kind === 'special' ? 'radio' : 'checkbox'} name="promo-product" checked={qtyOf(p.id) > 0} onChange={() => toggleProduct(p.id)} />
                    {p.images[0] && <img src={p.images[0]} alt="" />}
                    <span>
                      {p.name}
                      <small>{money(p.price)}</small>
                    </span>
                  </label>
                  {form.kind === 'combo' && qtyOf(p.id) > 0 && (
                    <span className="qty-step" aria-label={`Pieces of ${p.name}`}>
                      <button type="button" onClick={() => setQty(p.id, qtyOf(p.id) - 1)} disabled={qtyOf(p.id) <= 1} aria-label="One less">
                        −
                      </button>
                      <strong>{qtyOf(p.id)}</strong>
                      <button type="button" onClick={() => setQty(p.id, qtyOf(p.id) + 1)} aria-label="One more">
                        +
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
            {form.kind === 'combo' && form.product_ids.length > 0 && (
              <p className="small muted" style={{ margin: '6px 0 0' }}>
                {form.product_ids.length} {form.product_ids.length === 1 ? 'piece' : 'pieces'} selected, worth {money(itemsTotal)} at normal prices
              </p>
            )}
          </div>

          <div className="row">
            <label className="field" style={{ flex: 1, minWidth: 160 }}>
              <span>Offer price ({settings.currency})</span>
              <input className="input" type="number" min="0" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
            <label className="field" style={{ flex: 1, minWidth: 160 }}>
              <span>Usual price (optional)</span>
              <input
                className="input"
                type="number"
                min="0"
                inputMode="decimal"
                value={comparePrice}
                onChange={(e) => setComparePrice(e.target.value)}
                placeholder={itemsTotal ? `${itemsTotal} (${form.kind === 'combo' ? 'items total' : 'its normal price'})` : ''}
              />
            </label>
          </div>

          <div className="row">
            <label className="field" style={{ flex: 1, minWidth: 160 }}>
              <span>Starts (optional)</span>
              <input className="input" type="date" value={form.starts_on ?? ''} onChange={(e) => setForm({ ...form, starts_on: e.target.value || null })} />
            </label>
            <label className="field" style={{ flex: 1, minWidth: 160 }}>
              <span>Ends (optional)</span>
              <input className="input" type="date" value={form.ends_on ?? ''} onChange={(e) => setForm({ ...form, ends_on: e.target.value || null })} />
            </label>
          </div>

          <div className="field">
            <span className="small caps muted">Banner image (optional, otherwise the product photos are used)</span>
            <div className="row">
              {form.image && <img src={form.image} alt="" className="promo-thumb" />}
              <input type="file" accept="image/*" onChange={(e) => onImage(e.target.files?.[0])} disabled={busy} />
              {form.image && (
                <button type="button" className="link-btn small" onClick={() => setForm({ ...form, image: '' })}>
                  Remove image
                </button>
              )}
            </div>
          </div>

          <label className="row small">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Show this offer on the shop
          </label>

          <div className="row">
            <button className="btn" type="submit" disabled={busy}>
              Save offer
            </button>
            <button className="btn btn-outline" type="button" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {!editing && !error && (
        promos.length === 0 ? (
          <p className="small muted">No offers yet. The shop will not show an offers section until you add one.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Offer</th>
                  <th>Price</th>
                  <th>Dates</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {promos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.title}</strong>
                      <div className="small muted">
                        {p.kind === 'special' ? 'Special offer' : `Combo, ${p.product_ids.length} pieces`}
                      </div>
                    </td>
                    <td>
                      {money(p.price)}
                      {p.compare_price != null && <div className="small muted" style={{ textDecoration: 'line-through' }}>{money(p.compare_price)}</div>}
                    </td>
                    <td className="small">{p.starts_on || p.ends_on ? `${p.starts_on ?? '…'} to ${p.ends_on ?? '…'}` : 'Always'}</td>
                    <td>
                      <span className={`promo-status ${isLive(p) ? 'live' : ''}`}>{statusOf(p)}</span>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => toggleActive(p)}>
                          {p.active ? 'Turn off' : 'Turn on'}
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => open(p)}>
                          Edit
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => remove(p)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
