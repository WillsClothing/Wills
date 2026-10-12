import type { ProductStatus } from '../lib/types';

export const STATUS_LABELS: Record<ProductStatus, string> = {
  available: 'Available',
  sold_out: 'Sold out',
  unavailable: 'Unavailable (hidden)',
};

export default function StatusBadge({ status }: { status: ProductStatus }) {
  return <span className={`status status-${status}`}>{STATUS_LABELS[status]}</span>;
}
