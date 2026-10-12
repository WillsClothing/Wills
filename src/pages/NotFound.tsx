import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="container page empty">
      <h1>Page not found</h1>
      <Link to="/" className="btn">
        Back to shop
      </Link>
    </div>
  );
}
