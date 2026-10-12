import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteProduct, fetchAllProducts, setProductStatus } from '../lib/api';
import { formatPrice, sortSizes, totalStock } from '../lib/format';
import { useStore } from '../lib/store';
import type { Product, ProductStatus } from '../lib/types';
import { useAdmin } from './AdminLayout';
import { STATUS_LABELS } from './StatusBadge';

export default function AdminProducts() {
  const { notify } = useAdmin();
  const { settings } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      setProducts(await fetchAllProducts());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(p: Product, status: ProductStatus) {
    try {
      await setProductStatus(p.id, status);
      setProducts((list) => list.map((x) => (x.id === p.id ? { ...x, status } : x)));
      notify(`${p.name}: ${STATUS_LABELS[status]}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function remove(p: Product) {
    if (!confirm(`Delete "${p.name}" permanently? This also deletes its images.`)) return;
    try {
      await deleteProduct(p);
      setProducts((list) => list.filter((x) => x.id !== p.id));
      notify('Product deleted');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  const q = query.trim().toLowerCase();
  const visible = q
    ? products.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
    : products;

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Products</h1>
        <span className="spacer" />
        <Link to="/admin/products/new" className="btn">
          + Add product
        </Link>
      </div>
      <input className="input" placeholder="Search by name or category" value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 360 }} />

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && products.length === 0 && (
        <div className="panel center">
          <p>No products yet.</p>
          <Link to="/admin/products/new" className="btn">
            Add your first product
          </Link>
        </div>
      )}

      {visible.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Price</th>
                <th>Stock by size</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const total = totalStock(p.product_sizes);
                return (
                  <tr key={p.id}>
                    <td>{p.images[0] ? <img src={p.images[0]} alt="" /> : <div className="img-placeholder" style={{ width: 44, height: 55 }} />}</td>
                    <td>
                      <Link to={`/admin/products/${p.id}`}>
                        <strong>{p.name}</strong>
                      </Link>
                      {p.category && <div className="small muted">{p.category}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatPrice(p.price, settings.currency)}</td>
                    <td className="small">
                      {sortSizes(p.product_sizes).map((s) => (
                        <span key={s.id} className={s.stock === 0 ? 'muted' : s.stock <= 2 ? 'low' : ''} style={{ marginRight: 10, whiteSpace: 'nowrap' }}>
                          {s.size}: {s.stock}
                        </span>
                      ))}
                      <div className={total === 0 ? 'low' : 'muted'}>Total: {total}</div>
                    </td>
                    <td>
                      <select className="input" style={{ minHeight: 36, padding: '4px 8px', width: 'auto' }} value={p.status} onChange={(e) => changeStatus(p, e.target.value as ProductStatus)}>
                        {(Object.keys(STATUS_LABELS) as ProductStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link to={`/admin/products/${p.id}`} className="btn btn-outline btn-sm">
                        Edit
                      </Link>{' '}
                      <button className="btn btn-danger btn-sm" onClick={() => remove(p)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
