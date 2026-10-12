import { Link } from 'react-router-dom';
import { formatPrice, totalStock } from '../lib/format';
import type { Product } from '../lib/types';

export function isSoldOut(p: Product): boolean {
  return p.status === 'sold_out' || totalStock(p.product_sizes) === 0;
}

export default function ProductCard({ product, currency }: { product: Product; currency: string }) {
  const soldOut = isSoldOut(product);
  const cover = product.images[0];
  return (
    <Link to={`/product/${product.id}`} className="card">
      <div className="card-img">
        {cover ? (
          <img src={cover} alt={product.name} loading="lazy" />
        ) : (
          <div className="img-placeholder">No image</div>
        )}
        {soldOut && <span className="tag tag-dark">Sold out</span>}
      </div>
      <div className="card-body">
        <p className="card-name">{product.name}</p>
        <div className="card-price">{formatPrice(product.price, currency)}</div>
      </div>
    </Link>
  );
}
