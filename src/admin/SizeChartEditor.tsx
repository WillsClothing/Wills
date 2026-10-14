import { useState, type ChangeEvent } from 'react';
import { uploadImage } from '../lib/api';
import { useStore } from '../lib/store';
import type { SizeChart } from '../lib/types';

/** The size chart while it is being edited: values are kept per size name so they follow the size list. */
export interface ChartDraft {
  unit: 'in' | 'cm';
  columns: string[];
  values: Record<string, string[]>;
  note: string;
  image: string;
}

/** Usual measurements for each product type. */
export function defaultColumns(category: string): string[] {
  return /short|pant|trouser|jean|jogger/i.test(category) ? ['Waist', 'Length', 'Hip', 'Thigh'] : ['Chest', 'Length', 'Shoulder', 'Sleeve'];
}

export function draftFromChart(chart: SizeChart | null, category: string): ChartDraft {
  if (!chart) return { unit: 'in', columns: defaultColumns(category), values: {}, note: '', image: '' };
  return {
    unit: chart.unit === 'cm' ? 'cm' : 'in',
    columns: chart.columns.length ? [...chart.columns] : defaultColumns(category),
    values: Object.fromEntries(chart.rows.map((r) => [r.size, [...r.values]])),
    note: chart.note ?? '',
    image: chart.image ?? '',
  };
}

/** The chart to save, or null when nothing has been filled in. */
export function chartFromDraft(d: ChartDraft, sizes: string[]): SizeChart | null {
  const columns = d.columns.map((c) => c.trim());
  const keep = columns.map((c, i) => c !== '' || sizes.some((s) => (d.values[s]?.[i] ?? '').trim()));
  const cols = columns.filter((_, i) => keep[i]);
  const rows = sizes.map((size) => ({ size, values: columns.map((_, i) => (d.values[size]?.[i] ?? '').trim()).filter((_, i) => keep[i]) }));
  const hasValues = rows.some((r) => r.values.some(Boolean));
  if (!hasValues && !d.note.trim() && !d.image) return null;
  return { unit: d.unit, columns: cols, rows: hasValues ? rows : [], note: d.note.trim(), image: d.image };
}

export default function SizeChartEditor({
  draft,
  sizes,
  category,
  productId,
  onChange,
  notify,
}: {
  draft: ChartDraft;
  sizes: string[];
  category: string;
  productId?: string;
  onChange: (d: ChartDraft) => void;
  notify: (msg: string) => void;
}) {
  const { products } = useStore();
  const [uploading, setUploading] = useState(false);
  const others = products.filter((p) => p.id !== productId && p.size_chart);

  function setCell(size: string, col: number, value: string) {
    const row = [...(draft.values[size] ?? [])];
    row[col] = value;
    onChange({ ...draft, values: { ...draft.values, [size]: row } });
  }

  function renameColumn(i: number, name: string) {
    onChange({ ...draft, columns: draft.columns.map((c, j) => (j === i ? name : c)) });
  }

  function removeColumn(i: number) {
    onChange({
      ...draft,
      columns: draft.columns.filter((_, j) => j !== i),
      values: Object.fromEntries(Object.entries(draft.values).map(([s, v]) => [s, v.filter((_, j) => j !== i)])),
    });
  }

  function copyFrom(id: string) {
    const src = products.find((p) => p.id === id);
    if (!src?.size_chart) return;
    if (!confirm(`Replace this size chart with the one from ${src.name}?`)) return;
    onChange(draftFromChart(src.size_chart, category));
  }

  async function onImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      onChange({ ...draft, image: await uploadImage(file) });
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="panel">
      <div className="row" style={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Size chart</h2>
        {others.length > 0 && (
          <select className="input chart-copy" value="" onChange={(e) => copyFrom(e.target.value)} aria-label="Copy the size chart from another product">
            <option value="">Copy from another product…</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="small muted">
        Customers see this when they tap Size guide on the product page. Fill in the measurements for each size; empty columns are left out.
      </p>

      <label className="field full">
        <span>Fit note</span>
        <input
          className="input"
          value={draft.note}
          onChange={(e) => onChange({ ...draft, note: e.target.value })}
          placeholder={`e.g. Relaxed fit. Model is 6'0" and wears L.`}
        />
      </label>

      <div className="row" style={{ margin: '16px 0 10px' }}>
        <span className="small caps">Measured in</span>
        {(['in', 'cm'] as const).map((u) => (
          <button key={u} type="button" className={`chip ${draft.unit === u ? 'active' : ''}`} aria-pressed={draft.unit === u} onClick={() => onChange({ ...draft, unit: u })}>
            {u === 'in' ? 'Inches' : 'Centimetres'}
          </button>
        ))}
      </div>

      {sizes.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>Add sizes above to fill in their measurements.</p>
      ) : (
        <div className="table-wrap">
          <table className="table chart-table">
            <thead>
              <tr>
                <th>Size</th>
                {draft.columns.map((c, i) => (
                  <th key={i}>
                    <div className="chart-col">
                      <input className="input" value={c} onChange={(e) => renameColumn(i, e.target.value)} aria-label={`Measurement ${i + 1} name`} />
                      <button type="button" className="link-btn small" onClick={() => removeColumn(i)} aria-label={`Remove ${c || 'measurement'}`}>
                        ×
                      </button>
                    </div>
                  </th>
                ))}
                <th>
                  <button type="button" className="link-btn small" onClick={() => onChange({ ...draft, columns: [...draft.columns, ''] })}>
                    + Measurement
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sizes.map((size) => (
                <tr key={size}>
                  <td>
                    <strong>{size}</strong>
                  </td>
                  {draft.columns.map((c, i) => (
                    <td key={i}>
                      <input
                        className="input"
                        inputMode="decimal"
                        value={draft.values[size]?.[i] ?? ''}
                        onChange={(e) => setCell(size, i, e.target.value)}
                        aria-label={`${size} ${c}`}
                      />
                    </td>
                  ))}
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        {draft.image ? (
          <>
            <img src={draft.image} alt="Size chart" className="chart-thumb" />
            <button type="button" className="link-btn small" onClick={() => onChange({ ...draft, image: '' })}>
              Remove picture
            </button>
          </>
        ) : (
          <label className="btn btn-sm">
            {uploading ? 'Uploading…' : '+ Add a picture (optional)'}
            <input type="file" accept="image/*" hidden onChange={onImage} disabled={uploading} />
          </label>
        )}
        <span className="small muted">For example a how-to-measure drawing, shown under the chart.</span>
      </div>
    </section>
  );
}
