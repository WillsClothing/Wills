import { Link, NavLink, Outlet } from 'react-router-dom';
import { useCart } from '../lib/cart';
import { useStore } from '../lib/store';
import { isConfigured } from '../lib/supabase';
import { whatsappLink } from '../lib/whatsapp';
import WhatsAppIcon from './WhatsAppIcon';

export default function ShopLayout() {
  const { count } = useCart();
  const { settings } = useStore();
  const hasWhatsApp = Boolean(settings.whatsapp_number);
  const inquiry = `Hello ${settings.store_name}, I have a question.`;

  return (
    <>
      {!isConfigured && (
        <div className="demo-banner">
          Demo mode: showing sample products. Add your Supabase keys to go live (see README).
        </div>
      )}
      <div className="announcement">Order easily on WhatsApp · Cash on Delivery available</div>
      <header className="header">
        <div className="container">
          <Link to="/" className="logo">
            Wills
          </Link>
          <nav className="nav">
            <NavLink to="/" end>
              Shop
            </NavLink>
            {hasWhatsApp && (
              <a href={whatsappLink(settings.whatsapp_number, inquiry)} target="_blank" rel="noreferrer">
                Contact
              </a>
            )}
            <NavLink to="/cart" className="cart-link" aria-label={`Cart, ${count} items`}>
              Cart <span className="badge-count">{count}</span>
            </NavLink>
          </nav>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container stack">
          <div className="logo">{settings.store_name}</div>
          <p>
            Orders are confirmed on WhatsApp. Pay by Cash on Delivery or bank transfer.
            {settings.delivery_note && <><br />{settings.delivery_note}</>}
          </p>
          {hasWhatsApp && (
            <p>
              Questions?{' '}
              <a href={whatsappLink(settings.whatsapp_number, inquiry)} target="_blank" rel="noreferrer">
                Chat with us on WhatsApp
              </a>
            </p>
          )}
          <p className="small muted">
            © {new Date().getFullYear()} {settings.store_name}
          </p>
        </div>
      </footer>

      {hasWhatsApp && (
        <a
          className="wa-float"
          href={whatsappLink(settings.whatsapp_number, inquiry)}
          target="_blank"
          rel="noreferrer"
          aria-label="Chat with us on WhatsApp"
        >
          <WhatsAppIcon size={28} />
        </a>
      )}
    </>
  );
}
