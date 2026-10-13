import { useEffect, useMemo, useState } from 'react';
import { fetchAllProducts, fetchInventoryLogBetween } from '../lib/api';
import { formatPrice } from '../lib/format';
import { buildReport, dateString, downloadFile, periodRange, PRESETS, presetRange, reportToCsv, SALE_REASONS, todayString, type Preset } from '../lib/report';
import { useStore } from '../lib/store';
import type { InventoryLogEntry, Product } from '../lib/types';

export default function Reports() {
  const { settings } = useStore();
  const [start, setStart] = useState(todayString());
  const [end, setEnd] = useState(todayString());
  const [preset, setPreset] = useState<Preset | null>('today');
  const [log, setLog] = useState<InventoryLogEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!start || !end || start > end) return;
    let live = true;
    setLoading(true);
    setError(null);
    const [from, to] = periodRange(start, end);
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
  }, [start, end]);

  const report = useMemo(() => buildReport(start, end, log, products), [start, end, log, products]);
  const invalid = !start || !end || start > end;
  const multiDay = start !== end;

  function pick(p: Preset) {
    const [s, e] = presetRange(p);
    setStart(s);
    setEnd(e);
    setPreset(p);
  }
  const money = (n: number) => formatPrice(n, settings.currency);

  function download() {
    const csv = reportToCsv(report, settings.store_name, settings.currency);
    downloadFile(multiDay ? `wills-report-${start}-to-${end}.csv` : `wills-report-${start}.csv`, csv);
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
      <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Sales report</h1>
      <p className="small muted" style={{ margin: 0 }}>
        Pick a time frame, or a start and end date, to see what sold and every stock change, then download it as a spreadsheet (CSV, opens in Excel or Google Sheets). Sales
        are the pieces on your invoices (less any you cancel), plus stock you remove in Inventory with the reason{' '}
        {SALE_REASONS.map((r) => `"${r}"`).join(' or ')}, valued at each product's current price.
      </p>

      <div className="report-presets" role="group" aria-label="Time frame">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" className={`chip ${preset === p.key ? 'active' : ''}`} onClick={() => pick(p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ minWidth: 180 }}>
          <span>Start date</span>
          <input
            className="input"
            type="date"
            value={start}
            max={todayString()}
            onChange={(e) => {
              setStart(e.target.value);
              setPreset(null);
            }}
          />
        </label>
        <label className="field" style={{ minWidth: 180 }}>
          <span>End date</span>
          <input
            className="input"
            type="date"
            value={end}
            min={start}
            max={todayString()}
            onChange={(e) => {
              setEnd(e.target.value);
              setPreset(null);
            }}
          />
        </label>
        <button className="btn" onClick={download} disabled={loading || !!error || invalid}>
          Download report
        </button>
      </div>
      {invalid && <p className="error">The end date must be on or after the start date.</p>}

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
        <p className="small muted">{loading ? 'Loading…' : 'No sales recorded in this period.'}</p>
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

      {multiDay && report.byDay.length > 0 && (
        <>
          <h2 style={{ fontSize: '1rem', marginTop: 16 }}>Sales by day</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Units</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {report.byDay.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.units}</td>
                    <td style={{ fontWeight: 500 }}>{money(d.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 style={{ fontSize: '1rem', marginTop: 16 }}>All stock changes</h2>
      {report.log.length === 0 ? (
        <p className="small muted">{loading ? 'Loading…' : 'No stock changes in this period.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{multiDay ? 'When' : 'Time'}</th>
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
                    {multiDay ? `${dateString(new Date(l.created_at))} ${new Date(l.created_at).toLocaleTimeString()}` : new Date(l.created_at).toLocaleTimeString()}
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
