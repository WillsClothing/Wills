import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteImage, fetchProduct, saveProduct, uploadImage, type SizeInput } from '../lib/api';
import { sortSizes } from '../lib/format';
import type { ProductStatus } from '../lib/types';
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
  sizes: SizeInput[];
}

const EMPTY: FormState = {
  name: '',
  description: '',
  price: '',
  category: '',
  status: 'available',
  sort_order: '0',
  images: [],
  sizes: [],
};

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { notify } = useAdmin();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [removedImages, setRemovedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchProduct(id)
      .then((p) => {
        if (!p) {
          setError('Product not found');
          return;
        }
        setForm({
          name: p.name,
          description: p.description,
          price: String(p.price),
          category: p.category,
          status: p.status,
          sort_order: String(p.sort_order),
          images: p.images,
          sizes: sortSizes(p.product_sizes).map((s) => ({ id: s.id, size: s.size, stock: s.stock })),
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateSize(index: number, patch: Partial<SizeInput>) {
    set(
      'sizes',
      form.sizes.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }

  function addSize(label = '') {
    if (label && form.sizes.some((s) => s.size.toLowerCase() === label.toLowerCase())) return;
    set('sizes', [...form.sizes, { size: label, stock: 0 }]);
  }

  function moveSize(index: number, dir: -1 | 1) {
    const next = [...form.sizes];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    set('sizes', next);
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
    const labels = form.sizes.map((s) => s.size.trim().toLowerCase());
    if (!form.name.trim()) return setError('Please enter a product name.');
    if (!Number.isFinite(price) || price < 0) return setError('Please enter a valid price.');
    if (labels.some((l) => !l)) return setError('Every size needs a name (e.g. M), or remove the empty row.');
    if (new Set(labels).size !== labels.length) return setError('Each size can only be listed once.');
    if (form.sizes.some((s) => !Number.isInteger(s.stock) || s.stock < 0))
      return setError('Stock must be a whole number of 0 or more.');

    setSaving(true);
    try {
      await saveProduct(id ?? null, {
        name: form.name.trim(),
        description: form.description.trim(),
        price,
        category: form.category.trim(),
        status: form.status,
        sort_order: Number(form.sort_order) || 0,
        images: form.images,
        sizes: form.sizes,
      });
      await Promise.all(removedImages.map((u) => deleteImage(u).catch(() => undefined)));
      notify(isNew ? 'Product added' : 'Product saved');
      navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <form className="stack" onSubmit={submit}>
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
            <span>Category</span>
            <input className="input" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. T-Shirts" />
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
        <h2>Sizes &amp; stock</h2>
        {form.sizes.length === 0 && <p className="small muted">No sizes yet. Add at least one so customers can order.</p>}
        {form.sizes.map((s, i) => (
          <div className="size-row" key={s.id ?? `new-${i}`}>
            <input className="input" value={s.size} placeholder="Size (e.g. M)" onChange={(e) => updateSize(i, { size: e.target.value })} />
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={s.stock}
              onChange={(e) => updateSize(i, { stock: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              aria-label={`Stock for ${s.size}`}
            />
            <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => moveSize(i, -1)} aria-label="Move up">
                ↑
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => set('sizes', form.sizes.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          </div>
        ))}
        <div className="row" style={{ marginTop: 12, gap: 6 }}>
          {PRESET_SIZES.filter((p) => !form.sizes.some((s) => s.size.toLowerCase() === p.toLowerCase())).map((p) => (
            <button type="button" key={p} className="chip" onClick={() => addSize(p)}>
              + {p}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => addSize()}>
            + Custom
          </button>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Stock is only ever changed by admins. Customer carts never reduce it. Changes here are saved to the inventory log.
        </p>
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
