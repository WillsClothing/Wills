import { createPortal } from 'react-dom';
import Barcode from '../components/Barcode';
import { formatPrice } from '../lib/format';
import { useStore } from '../lib/store';
import type { ProductSize } from '../lib/types';

/** Printable barcode labels for a product's variants. Hidden on screen; shown only by window.print(). */
export default function LabelSheet({ name, price, variants, perStock }: { name: string; price: number; variants: ProductSize[]; perStock: boolean }) {
  const { settings } = useStore();
  const labels = variants
    .filter((v) => v.barcode)
    .flatMap((v) => Array.from({ length: perStock ? v.stock : 1 }, (_, i) => ({ v, key: `${v.id}-${i}` })));
  // Rendered straight into <body> so print layout is not affected by the admin page around it.
  return createPortal(
    <div className="label-sheet" aria-hidden="true">
      {labels.map(({ v, key }) => (
        <div className="label" key={key}>
          <strong>{settings.store_name}</strong>
          <span className="label-name">{name}</span>
          <span className="label-variant">{[v.color, v.size && `Size ${v.size}`].filter(Boolean).join(' · ')}</span>
          <Barcode code={v.barcode!} height={40} />
          <span className="label-foot">
            <span className="mono">{v.sku}</span>
            <strong>{formatPrice(price, settings.currency)}</strong>
          </span>
        </div>
      ))}
    </div>,
    document.body,
  );
}
