import { Link } from 'react-router-dom';
import FreeDelivery from './FreeDelivery';
import { isLight } from '../lib/colors';
import { formatPrice, totalStock, uniqueSizes } from '../lib/format';
import type { Product } from '../lib/types';

export function isSoldOut(p: Product): boolean {
  return p.status === 'sold_out' || totalStock(p.product_sizes) === 0;
}

// Gentle 3D tilt that follows the pointer.
function tilt(e: React.MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  e.currentTarget.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`);
  e.currentTarget.style.setProperty('--ry', `${(x * 6).toFixed(2)}deg`);
}

function untilt(e: React.MouseEvent<HTMLElement>) {
  e.currentTarget.style.setProperty('--rx', '0deg');
  e.currentTarget.style.setProperty('--ry', '0deg');
}

export default function ProductCard({ product, currency }: { product: Product; currency: string }) {
  const soldOut = isSoldOut(product);
  const [cover, hover] = product.images;
  const sizes = uniqueSizes(product.product_sizes.filter((s) => s.stock > 0));
  return (
    <Link to={`/product/${product.id}`} className={`card ${hover ? 'has-hover' : ''}`} onMouseMove={tilt} onMouseLeave={untilt}>
      <div className="card-img">
        {cover ? <img src={cover} alt={product.name} loading="lazy" /> : <div className="img-placeholder">No image</div>}
        {hover && <img className="card-img-alt" src={hover} alt="" loading="lazy" />}
        {soldOut && <span className="tag tag-dark">Sold out</span>}
        <span className="card-shine" aria-hidden="true" />
        <FreeDelivery variant="card" />
        <span className="card-cta">{soldOut ? 'View' : 'View details'}</span>
      </div>
      <div className="card-body">
        {product.category && <p className="card-type">{product.category}</p>}
        <p className="card-name">{product.name}</p>
        <div className="card-meta">
          <span className="card-price">{formatPrice(product.price, currency)}</span>
          {!soldOut && sizes.length > 0 && <span className="card-sizes">{sizes.join(' · ')}</span>}
        </div>
        {product.colors.length > 0 && (
          <div className="card-colors" aria-label={`Colours: ${product.colors.map((c) => c.name).join(', ')}`}>
            {product.colors.slice(0, 6).map((c) => (
              <span key={c.name} className={`color-dot ${isLight(c.hex) ? 'light' : ''}`} style={{ background: c.hex }} title={c.name} />
            ))}
            {product.colors.length > 6 && <small>+{product.colors.length - 6}</small>}
          </div>
        )}
      </div>
    </Link>
  );
}
