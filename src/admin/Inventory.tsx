import { useCallback, useEffect, useState } from 'react';
import { adjustStock, fetchAllProducts, fetchInventoryLog } from '../lib/api';
import { sortSizes } from '../lib/format';
import type { InventoryLogEntry, Product } from '../lib/types';
import { useAdmin } from './AdminLayout';
import StatusBadge from './StatusBadge';

const REASONS = ['Sale', 'Shipment sent', 'Restock', 'Return', 'Damaged', 'Stock count correction'];

export default function Inventory() {
  const { notify } = useAdmin();
  const [products, setProducts] = useState<Product[]>([]);
  const [log, setLog] = useState<InventoryLogEntry[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, l] = await Promise.all([fetchAllProducts(), fetchInventoryLog(50)]);
      setProducts(p);
      setLog(l);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load inventory');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function apply(product: Product, sizeId: string, sign: 1 | -1) {
    const amount = Math.floor(Number(amounts[sizeId] || 1));
    if (!Number.isFinite(amount) || amount <= 0) return notify('Enter a quantity of 1 or more');
    setBusy(sizeId);
    try {
      const newStock = await adjustStock(sizeId, sign * amount, reason);
      setProducts((list) =>
        list.map((p) =>
          p.id === product.id
            ? { ...p, product_sizes: p.product_sizes.map((s) => (s.id === sizeId ? { ...s, stock: newStock } : s)) }
            : p,
        ),
      );
      setAmounts((a) => ({ ...a, [sizeId]: '' }));
      notify(`${product.name}: stock is now ${newStock}`);
      setLog(await fetchInventoryLog(50));
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(null);
    }
  }

  const q = query.trim().toLowerCase();
  const visible = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;

  return (
    <div className="stack">
      <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Inventory</h1>
      <p className="small muted" style={{ margin: 0 }}>
        Update stock after a sale, shipment or new delivery. Enter a quantity, then press − to remove or + to add. Every change is logged below.
      </p>
      <div className="row">
        <label className="field" style={{ minWidth: 220 }}>
          <span>Reason for change</span>
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: 1, minWidth: 200 }}>
          <span>Search</span>
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Product name" />
        </label>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Size</th>
              <th>In stock</th>
              <th>Adjust</th>
            </tr>
          </thead>
          <tbody>
            {visible.flatMap((p) =>
              sortSizes(p.product_sizes).map((s, i) => (
                <tr key={s.id}>
                  <td>
                    {i === 0 && (
                      <>
                        <strong>{p.name}</strong>
                        <div style={{ marginTop: 4 }}>
                          <StatusBadge status={p.status} />
                        </div>
                      </>
                    )}
                  </td>
                  <td>{s.size}</td>
                  <td className={s.stock === 0 ? 'low' : ''} style={{ fontWeight: 700 }}>
                    {s.stock}
                  </td>
                  <td>
                    <div className="stock-cell">
                      <button className="btn btn-outline btn-sm" disabled={busy === s.id || s.stock === 0} onClick={() => apply(p, s.id, -1)} aria-label="Remove stock">
                        −
                      </button>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        placeholder="1"
                        inputMode="numeric"
                        value={amounts[s.id] ?? ''}
                        onChange={(e) => setAmounts((a) => ({ ...a, [s.id]: e.target.value }))}
                        aria-label={`Quantity for ${p.name} ${s.size}`}
                      />
                      <button className="btn btn-sm" disabled={busy === s.id} onClick={() => apply(p, s.id, 1)} aria-label="Add stock">
                        +
                      </button>
                    </div>
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: '1rem', marginTop: 32 }}>Recent stock changes</h2>
      {log.length === 0 ? (
        <p className="small muted">No changes yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Product</th>
                <th>Size</th>
                <th>Change</th>
                <th>New stock</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id}>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(l.created_at).toLocaleString()}
                  </td>
                  <td>{l.product_name}</td>
                  <td>{l.size}</td>
                  <td style={{ fontWeight: 700 }}>{l.change > 0 ? `+${l.change}` : l.change}</td>
                  <td>{l.new_stock}</td>
                  <td className="small">{l.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
