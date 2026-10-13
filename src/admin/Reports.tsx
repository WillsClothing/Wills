import { useEffect, useMemo, useState } from 'react';
import { fetchAllProducts, fetchInventoryLogBetween } from '../lib/api';
import { formatPrice } from '../lib/format';
import { buildDailyReport, dayRange, downloadFile, reportToCsv, SALE_REASONS, todayString } from '../lib/report';
import { useStore } from '../lib/store';
import type { InventoryLogEntry, Product } from '../lib/types';

export default function Reports() {
  const { settings } = useStore();
  const [date, setDate] = useState(todayString());
  const [log, setLog] = useState<InventoryLogEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) return;
    let live = true;
    setLoading(true);
    setError(null);
    const [from, to] = dayRange(date);
    Promise.all([fetchInventoryLogBetween(from, to), fetchAllProducts()])
      .then(([l, p]) => {
        if (!live) return;
        setLog(l);
        setProducts(p);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Could not load the report'))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [date]);

  const report = useMemo(() => buildDailyReport(date, log, products), [date, log, products]);
  const money = (n: number) => formatPrice(n, settings.currency);

  function download() {
    const csv = reportToCsv(report, settings.store_name, settings.currency);
    downloadFile(`wills-report-${date}.csv`, csv);
  }

  const tiles = [
    { label: 'Sales value', value: money(report.salesValue) },
    { label: 'Units sold', value: report.unitsSold },
    { label: 'Units restocked', value: report.restocked },
    { label: 'Returns', value: report.returned },
    { label: 'Damaged', value: report.damaged },
    { label: 'Stock changes', value: report.log.length },
  ];

  return (
    <div className="stack">
      <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Daily report</h1>
      <p className="small muted" style={{ margin: 0 }}>
        Pick a day to see its sales and stock activity, then download it as a spreadsheet (CSV, opens in Excel or Google Sheets). Sales
        are the stock you remove in Inventory with the reason {SALE_REASONS.map((r) => `"${r}"`).join(' or ')}, valued at each product's
        current price.
      </p>

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ minWidth: 200 }}>
          <span>Day</span>
          <input className="input" type="date" value={date} max={todayString()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn" onClick={download} disabled={loading || !!error}>
          Download report
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="report-tiles" aria-busy={loading}>
        {tiles.map((t) => (
          <div key={t.label} className="report-tile">
            <span>{t.label}</span>
            <strong>{loading ? '…' : t.value}</strong>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: '1rem', marginTop: 16 }}>Sales by product</h2>
      {report.sales.length === 0 ? (
        <p className="small muted">{loading ? 'Loading…' : 'No sales recorded on this day.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Size</th>
                <th>Units</th>
                <th>Unit price</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {report.sales.map((s) => (
                <tr key={`${s.product}-${s.size}`}>
                  <td>{s.product}</td>
                  <td>{s.size}</td>
                  <td>{s.units}</td>
                  <td>{money(s.unitPrice)}</td>
                  <td style={{ fontWeight: 500 }}>{money(s.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ fontSize: '1rem', marginTop: 16 }}>All stock changes</h2>
      {report.log.length === 0 ? (
        <p className="small muted">{loading ? 'Loading…' : 'No stock changes on this day.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Product</th>
                <th>Size</th>
                <th>Change</th>
                <th>New stock</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {report.log.map((l) => (
                <tr key={l.id}>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(l.created_at).toLocaleTimeString()}
                  </td>
                  <td>{l.product_name}</td>
                  <td>{l.size}</td>
                  <td style={{ fontWeight: 500 }}>{l.change > 0 ? `+${l.change}` : l.change}</td>
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
