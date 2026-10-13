import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { deleteImage, fetchCustomColors, fetchProduct, saveCustomColors, saveProduct, uploadImage, type SizeInput } from '../lib/api';
import { CATEGORIES } from '../lib/catalog';
import { isLight, PRESET_COLORS, sameColor } from '../lib/colors';
import { sortSizes, uniqueSizes } from '../lib/format';
import { useStore } from '../lib/store';
import Barcode from '../components/Barcode';
import LabelSheet from './LabelSheet';
import type { ProductColor, ProductSize, ProductStatus } from '../lib/types';
import { useAdmin } from './AdminLayout';
import { STATUS_LABELS } from './StatusBadge';

const PRESET_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free size'];
const MAX_IMAGE_MB = 5;

interface FormState {
  name: string;
  description: string;
  price: string;
  category: string;
  status: ProductStatus;
  sort_order: string;
  images: string[];
  colors: ProductColor[];
  /** Size names in display order. */
  sizes: string[];
  /** Stock per colour + size (see cellKey). */
  stock: Record<string, number>;
  /** Existing variant ids per colour + size, so edits keep their SKU, barcode and history. */
  ids: Record<string, string>;
}

/** Stock grid cell for a colour ('' = no colour) and size. */
const cellKey = (color: string, size: string) => `${color.toLowerCase()}\u0000${size.toLowerCase()}`;

const EMPTY: FormState = {
  name: '',
  description: '',
  price: '',
  category: CATEGORIES[0],
  status: 'available',
  sort_order: '0',
  images: [],
  colors: [],
  sizes: [],
  stock: {},
  ids: {},
};

type SavedInfo = { id: string; isNew: boolean; visible: boolean; name: string };

/** Shown after a save: confirms it and offers the next step. */
function SavedDialog({ info, onClose }: { info: SavedInfo; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal saved-modal" role="dialog" aria-modal="true" aria-labelledby="saved-title" onClick={(e) => e.stopPropagation()}>
        <div className="saved-tick" aria-hidden="true">✓</div>
        <p className="eyebrow">{info.isNew ? 'Product added' : 'Changes saved'}</p>
        <h2 id="saved-title">{info.name || 'Product saved'}</h2>
        <p className="muted">
          {info.isNew ? 'It now has its own SKUs and barcodes.' : 'Your changes are saved.'}{' '}
          {info.visible ? 'Customers can see it in the shop.' : 'It is hidden from the shop.'}
        </p>
        <div className="modal-actions">
          <Link to="/admin" className="btn btn-gold">
            Back to admin home
          </Link>
          {info.visible && (
            <Link to={`/product/${info.id}`} className="btn" onClick={() => window.scrollTo(0, 0)}>
              View in shop
            </Link>
          )}
          <button type="button" className="link-btn" onClick={onClose}>
            Keep editing
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { notify } = useAdmin();
  const { reload: reloadShop } = useStore();
  const location = useLocation();
  const [saved, setSaved] = useState<SavedInfo | null>(null);
  // A new product arrives here with the "just saved" info in the navigation state. Show it once, then
  // drop it from history so a refresh doesn't bring the dialog back.
  const savedFromNav = (location.state as { saved?: SavedInfo } | null)?.saved;
  useEffect(() => {
    if (!savedFromNav) return;
    setSaved(savedFromNav);
    navigate(location.pathname, { replace: true });
  }, [savedFromNav, location.pathname, navigate]);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [removedImages, setRemovedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [customColors, setCustomColors] = useState<ProductColor[]>([]);
  const [newColor, setNewColor] = useState<ProductColor>({ name: '', hex: '#c8a96a' });
  const [variants, setVariants] = useState<ProductSize[]>([]);
  const [productSku, setProductSku] = useState<string | null>(null);
  const [labelsPerStock, setLabelsPerStock] = useState(false);
  const [customSize, setCustomSize] = useState('');

  useEffect(() => {
    fetchCustomColors().then(setCustomColors);
  }, []);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!id) return;
    fetchProduct(id)
      .then((p) => {
        if (!p) {
          setError('Product not found');
          return;
        }
        // Variants saved before colours existed have no colour: give them to the first colour so their stock is kept.
        const rows = sortSizes(p.product_sizes).map((v) =>
          !v.color && p.colors.length && p.product_sizes.every((x) => !x.color) ? { ...v, color: p.colors[0].name } : v,
        );
        const colors = [...p.colors];
        for (const v of rows) {
          if (v.color && !colors.some((c) => sameColor(c.name, v.color))) colors.push({ name: v.color, hex: '#9a9a9a' });
        }
        const stock: Record<string, number> = {};
        const ids: Record<string, string> = {};
        for (const v of rows) {
          stock[cellKey(v.color, v.size)] = v.stock;
          ids[cellKey(v.color, v.size)] = v.id;
        }
        setVariants(sortSizes(p.product_sizes));
        setProductSku(p.sku);
        setForm({
          name: p.name,
          description: p.description,
          price: String(p.price),
          category: p.category,
          status: p.status,
          sort_order: String(p.sort_order),
          images: p.images,
          colors,
          sizes: uniqueSizes(rows),
          stock,
          ids,
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, reloadKey]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addSize(label: string) {
    const name = label.trim();
    if (!name || form.sizes.some((s) => s.toLowerCase() === name.toLowerCase())) return;
    set('sizes', [...form.sizes, name]);
  }

  function removeSize(name: string) {
    set('sizes', form.sizes.filter((s) => s !== name));
  }

  function moveSize(index: number, dir: -1 | 1) {
    const next = [...form.sizes];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    set('sizes', next);
  }

  function setStock(color: string, size: string, value: string) {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    setForm((f) => ({ ...f, stock: { ...f.stock, [cellKey(color, size)]: n } }));
  }

  /** The colour rows of the stock grid: the chosen colours, or one row when there is no colour choice. */
  const gridColors = form.colors.length ? form.colors.map((c) => c.name) : [''];
  const totalUnits = gridColors.reduce((n, c) => n + form.sizes.reduce((m, sz) => m + (form.stock[cellKey(c, sz)] ?? 0), 0), 0);

  function toggleColor(c: ProductColor) {
    const on = form.colors.some((x) => sameColor(x.name, c.name));
    set('colors', on ? form.colors.filter((x) => !sameColor(x.name, c.name)) : [...form.colors, c]);
  }

  async function addCustomColor() {
    const name = newColor.name.trim();
    if (!name) return notify('Give the colour a name, e.g. Dusty Rose');
    const color = { name, hex: newColor.hex };
    const known = [...PRESET_COLORS, ...customColors].find((c) => sameColor(c.name, name));
    if (!known) {
      const next = [...customColors, color];
      setCustomColors(next);
      saveCustomColors(next).catch((e) => notify(e instanceof Error ? e.message : 'Could not save the colour for later'));
    }
    if (!form.colors.some((c) => sameColor(c.name, name))) set('colors', [...form.colors, known ?? color]);
    setNewColor({ name: '', hex: newColor.hex });
  }

  function forgetCustomColor(c: ProductColor) {
    if (!confirm(`Remove "${c.name}" from your saved colours? Products that already use it keep it.`)) return;
    const next = customColors.filter((x) => !sameColor(x.name, c.name));
    setCustomColors(next);
    saveCustomColors(next).catch((e) => notify(e instanceof Error ? e.message : 'Could not update saved colours'));
  }

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        notify(`${file.name} is not an image`);
        continue;
      }
      if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        notify(`${file.name} is larger than ${MAX_IMAGE_MB} MB`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const url = await uploadImage(file);
        setForm((f) => ({ ...f, images: [...f.images, url] }));
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function moveImage(index: number, dir: -1 | 1) {
    const next = [...form.images];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    set('images', next);
  }

  function removeImage(url: string) {
    set(
      'images',
      form.images.filter((u) => u !== url),
    );
    setRemovedImages((r) => [...r, url]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const price = Number(form.price);
    if (!form.name.trim()) return setError('Please enter a product name.');
    if (!Number.isFinite(price) || price < 0) return setError('Please enter a valid price.');
    if (!form.category) return setError('Choose a product type.');
    if (form.sizes.length === 0) return setError('Add at least one size so customers can order.');

    const sizes: SizeInput[] = gridColors.flatMap((color) =>
      form.sizes.map((size) => ({
        id: form.ids[cellKey(color, size)],
        size,
        color,
        stock: form.stock[cellKey(color, size)] ?? 0,
      })),
    );

    setSaving(true);
    try {
      const savedId = await saveProduct(id ?? null, {
        name: form.name.trim(),
        description: form.description.trim(),
        price,
        category: form.category.trim(),
        status: form.status,
        sort_order: Number(form.sort_order) || 0,
        images: form.images,
        colors: form.colors,
        sizes,
      });
      await Promise.all(removedImages.map((u) => deleteImage(u).catch(() => undefined)));
      setRemovedImages([]);
      await reloadShop();
      // Confirm the save and let the admin choose where to go next.
      const done = { id: savedId, isNew, visible: form.status !== 'unavailable', name: form.name.trim() };
      if (isNew) navigate(`/admin/products/${savedId}`, { replace: true, state: { saved: done } });
      else {
        setSaved(done);
        setReloadKey((k) => k + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <form className="stack" onSubmit={submit}>
      {saved && (
        <SavedDialog
          info={saved}
          onClose={() => setSaved(null)}
        />
      )}
      <p className="small">
        <Link to="/admin">← All products</Link>
      </p>
      <h1 style={{ fontSize: '1.4rem' }}>{isNew ? 'Add product' : `Edit: ${form.name}`}</h1>

      <section className="panel">
        <h2>Details</h2>
        <div className="form-grid">
          <label className="field full">
            <span>Name *</span>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </label>
          <label className="field">
            <span>Price *</span>
            <input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} required />
          </label>
          <label className="field">
            <span>Product type</span>
            <select className="input" value={form.category} onChange={(e) => set('category', e.target.value)} required>
              <option value="" disabled>
                Choose a product type
              </option>
              {[...CATEGORIES, ...(form.category && !CATEGORIES.includes(form.category) ? [form.category] : [])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select className="input" value={form.status} onChange={(e) => set('status', e.target.value as ProductStatus)}>
              {(Object.keys(STATUS_LABELS) as ProductStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Display order</span>
            <input className="input" type="number" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
          </label>
          <label className="field full">
            <span>Description</span>
            <textarea className="input" rows={5} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Fabric, fit, care instructions…" />
          </label>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Available: shown and orderable. Sold out: shown with a badge, cannot be ordered. Unavailable: hidden from the shop.
          Lower display order numbers appear first.
        </p>
      </section>

      <section className="panel">
        <h2>Colours</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Tap the colours this product comes in, then fill in the stock for each colour below. Customers only see the colours you pick here. Leave all off if there is no colour choice.
        </p>
        {form.colors.length > 0 && (
          <div className="color-picked">
            <span className="small caps muted">Selected</span>
            {form.colors.map((c) => (
              <button type="button" key={c.name} className="color-chip on" onClick={() => toggleColor(c)} title="Remove">
                <i className={isLight(c.hex) ? 'light' : ''} style={{ background: c.hex }} />
                {c.name} <span aria-hidden="true">✕</span>
              </button>
            ))}
          </div>
        )}
        <div className="color-palette">
          {[...PRESET_COLORS, ...customColors].map((c) => {
            const on = form.colors.some((x) => sameColor(x.name, c.name));
            const custom = !PRESET_COLORS.includes(c);
            return (
              <div key={c.name} className={`color-option ${on ? 'on' : ''}`}>
                <button type="button" onClick={() => toggleColor(c)} aria-pressed={on}>
                  <i className={isLight(c.hex) ? 'light' : ''} style={{ background: c.hex }} />
                  <span>{c.name}</span>
                </button>
                {custom && (
                  <button type="button" className="color-forget" onClick={() => forgetCustomColor(c)} aria-label={`Remove saved colour ${c.name}`}>
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="color-add">
          <span className="small caps muted">Add your own colour</span>
          <div className="row" style={{ gap: 8 }}>
            <input type="color" value={newColor.hex} onChange={(e) => setNewColor({ ...newColor, hex: e.target.value })} aria-label="Pick the colour" />
            <input
              className="input"
              placeholder="Colour name, e.g. Dusty Rose"
              value={newColor.name}
              onChange={(e) => setNewColor({ ...newColor, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomColor();
                }
              }}
              style={{ flex: 1, minWidth: 180 }}
            />
            <button type="button" className="btn btn-outline btn-sm" onClick={addCustomColor}>
              + Add colour
            </button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Colours you add are saved to the palette, so you can reuse them on other products.</p>
        </div>
      </section>

      <section className="panel">
        <h2>Sizes &amp; stock</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Add the sizes, then enter how many you have of each size in each colour. Customers only see sizes that are in stock in the colour they pick.
        </p>
        <div className="row" style={{ gap: 6 }}>
          {form.sizes.map((sz, i) => (
            <span key={sz} className="size-pill">
              <button type="button" onClick={() => moveSize(i, -1)} aria-label={`Move ${sz} left`} disabled={i === 0}>
                ‹
              </button>
              {sz}
              <button type="button" onClick={() => removeSize(sz)} aria-label={`Remove size ${sz}`}>
                ✕
              </button>
            </span>
          ))}
          {PRESET_SIZES.filter((p) => !form.sizes.some((s) => s.toLowerCase() === p.toLowerCase())).map((p) => (
            <button type="button" key={p} className="chip" onClick={() => addSize(p)}>
              + {p}
            </button>
          ))}
          <input
            className="input"
            style={{ width: 140, minHeight: 34, padding: '4px 10px' }}
            placeholder="Other size"
            value={customSize}
            onChange={(e) => setCustomSize(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSize(customSize);
                setCustomSize('');
              }
            }}
            onBlur={() => {
              addSize(customSize);
              setCustomSize('');
            }}
          />
        </div>

        {form.sizes.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="table stock-grid">
              <thead>
                <tr>
                  <th>{form.colors.length ? 'Colour' : ''}</th>
                  {form.sizes.map((sz) => (
                    <th key={sz}>{sz}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {gridColors.map((color) => {
                  const hex = form.colors.find((c) => c.name === color)?.hex;
                  const rowTotal = form.sizes.reduce((n, sz) => n + (form.stock[cellKey(color, sz)] ?? 0), 0);
                  return (
                    <tr key={color || 'none'}>
                      <th scope="row">
                        {color ? (
                          <span className="cart-color">
                            <span className={`color-dot ${hex && isLight(hex) ? 'light' : ''}`} style={{ background: hex }} />
                            {color}
                          </span>
                        ) : (
                          <span className="small muted">Stock</span>
                        )}
                      </th>
                      {form.sizes.map((sz) => (
                        <td key={sz}>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            value={form.stock[cellKey(color, sz)] ?? 0}
                            onChange={(e) => setStock(color, sz, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            aria-label={`Stock for ${[color, sz].filter(Boolean).join(' ')}`}
                          />
                        </td>
                      ))}
                      <td className="small" style={{ fontWeight: 500 }}>
                        {rowTotal}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted" style={{ marginBottom: 0 }}>
          {totalUnits} {totalUnits === 1 ? 'piece' : 'pieces'} in total. Stock is only ever changed by admins and every change is saved to the inventory log.
        </p>
      </section>

      <section className="panel">
        <div className="row" style={{ alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>SKUs &amp; barcodes</h2>
          {productSku && <span className="small muted">Product SKU: {productSku}</span>}
        </div>
        {variants.length === 0 ? (
          <p className="small muted" style={{ marginBottom: 0 }}>
            Every size and colour gets its own SKU and EAN-13 barcode automatically when you save.
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table sku-table">
                <thead>
                  <tr>
                    <th>Variant</th>
                    <th>SKU</th>
                    <th>Barcode (EAN-13)</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => (
                    <tr key={v.id}>
                      <td>{[v.color, v.size].filter(Boolean).join(' · ')}</td>
                      <td className="mono">{v.sku || '—'}</td>
                      <td>{v.barcode ? <Barcode code={v.barcode} height={34} /> : <span className="small muted">Run variants.sql to create</span>}</td>
                      <td>{v.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()} disabled={!variants.some((v) => v.barcode)}>
                Print barcode labels
              </button>
              <label className="row small" style={{ gap: 6 }}>
                <input type="checkbox" checked={labelsPerStock} onChange={(e) => setLabelsPerStock(e.target.checked)} />
                One label per piece in stock
              </label>
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              Barcodes use the 200 prefix that GS1 reserves for in-store use, so they scan on any EAN-13 reader without clashing with registered
              retail barcodes. SKU format: product, colour, size (e.g. WC-TSH-1001-BLK-M). Save first to see codes for new sizes or colours.
            </p>
            <LabelSheet name={form.name} price={Number(form.price) || 0} variants={variants} perStock={labelsPerStock} />
          </>
        )}
      </section>

      <section className="panel">
        <h2>Images</h2>
        <div className="img-grid">
          {form.images.map((url, i) => (
            <div className="img-tile" key={url}>
              <img src={url} alt="" />
              {i === 0 && <span className="tag cover">Cover</span>}
              <div className="tools">
                <button type="button" onClick={() => moveImage(i, -1)} aria-label="Move left">
                  ←
                </button>
                <button type="button" onClick={() => removeImage(url)} aria-label="Remove image">
                  ✕
                </button>
                <button type="button" onClick={() => moveImage(i, 1)} aria-label="Move right">
                  →
                </button>
              </div>
            </div>
          ))}
          <label className="upload-tile">
            <input type="file" accept="image/*" multiple onChange={onFiles} />
            {uploading ? `Uploading ${uploading}…` : '+ Upload images'}
          </label>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          The first image is the cover. Up to {MAX_IMAGE_MB} MB each; portrait photos (4:5) look best.
        </p>
      </section>

      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="btn" disabled={saving || uploading > 0}>
          {saving ? 'Saving…' : isNew ? 'Add product' : 'Save changes'}
        </button>
        <Link to="/admin" className="btn btn-outline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
