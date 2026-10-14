import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SizeChart } from '../lib/types';

/** Converts every number in a cell, so "40" and "40-42" both switch between inches and centimetres. */
function convert(value: string, from: 'in' | 'cm', to: 'in' | 'cm'): string {
  if (from === to) return value;
  return value.replace(/\d+(?:\.\d+)?/g, (n) => {
    const v = from === 'in' ? Number(n) * 2.54 : Number(n) / 2.54;
    return String(Math.round(v * (to === 'in' ? 2 : 1)) / (to === 'in' ? 2 : 1));
  });
}

/** The product's size chart in a pop-up, with an inches / centimetres switch. */
export default function SizeGuide({ chart, name, selectedSize, onClose }: { chart: SizeChart; name: string; selectedSize?: string; onClose: () => void }) {
  const [unit, setUnit] = useState<'in' | 'cm'>(chart.unit);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal size-guide" role="dialog" aria-modal="true" aria-labelledby="size-guide-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="offer-pop-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">Size guide</p>
        <h2 id="size-guide-title">{name}</h2>
        {chart.note && <p className="size-guide-note">{chart.note}</p>}

        {chart.rows.length > 0 && (
          <>
            <div className="size-guide-units" role="group" aria-label="Units">
              {(['in', 'cm'] as const).map((u) => (
                <button key={u} type="button" className={`chip ${unit === u ? 'active' : ''}`} aria-pressed={unit === u} onClick={() => setUnit(u)}>
                  {u === 'in' ? 'Inches' : 'CM'}
                </button>
              ))}
            </div>
            <div className="size-guide-table">
              <table>
                <thead>
                  <tr>
                    <th>Size</th>
                    {chart.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chart.rows.map((r) => (
                    <tr key={r.size} className={r.size === selectedSize ? 'picked' : ''}>
                      <th>{r.size}</th>
                      {chart.columns.map((c, i) => (
                        <td key={c}>{r.values[i] ? convert(r.values[i], chart.unit, unit) : '–'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ margin: '10px 0 0' }}>
              All measurements in {unit === 'in' ? 'inches' : 'centimetres'}.
            </p>
          </>
        )}
        {chart.image && <img src={chart.image} alt={`${name} size chart`} className="size-guide-img" />}
      </div>
    </div>,
    document.body,
  );
}
