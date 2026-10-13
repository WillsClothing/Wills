/** "Island wide free delivery" badge shown on every product, in the cart and at checkout. */
export function TruckIcon() {
  return (
    <svg className="truck" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 6h11v10H2z M13 9h4l3 3.5V16h-7z" />
      <circle cx="6" cy="17.5" r="1.8" />
      <circle cx="16.5" cy="17.5" r="1.8" />
    </svg>
  );
}

export default function FreeDelivery({ variant = 'line' }: { variant?: 'line' | 'card' | 'strip' }) {
  if (variant === 'strip') {
    return (
      <div className="free-strip">
        <span className="free-strip-icon">
          <TruckIcon />
        </span>
        <span>
          <strong>Island wide free delivery</strong>
          <small>Delivered free to your door, anywhere in Sri Lanka</small>
        </span>
      </div>
    );
  }
  return (
    <span className={`free-badge ${variant === 'card' ? 'on-card' : ''}`}>
      <TruckIcon />
      {variant === 'card' ? 'Free delivery' : 'Island wide free delivery'}
    </span>
  );
}
