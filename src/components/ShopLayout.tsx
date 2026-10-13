import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../lib/cart';
import { useStore } from '../lib/store';
import { isConfigured } from '../lib/supabase';
import { whatsappLink } from '../lib/whatsapp';
import { TruckIcon } from './FreeDelivery';
import Logo from './Logo';
import Socials from './Socials';
import { OfferDock, OfferPopup } from './Offers';
import WhatsAppIcon from './WhatsAppIcon';
import WillsBot from './WillsBot';

export default function ShopLayout() {
  const { count } = useCart();
  const { settings, products, promotions } = useStore();
  const hasWhatsApp = Boolean(settings.whatsapp_number);
  const inquiry = `Hello ${settings.store_name}, I have a question.`;
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      document.documentElement.style.setProperty('--scroll', String(max > 0 ? Math.min(1, window.scrollY / max) : 0));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      {!isConfigured && (
        <div className="demo-banner">
          Demo mode: showing sample products. Add your Supabase keys to go live (see README).
        </div>
      )}
      <div className="scroll-progress" aria-hidden="true" />
      <div className="announcement">
        <TruckIcon />
        <span className="announcement-text">Island wide free delivery</span>
      </div>
      <header className={`header ${scrolled ? 'scrolled' : ''}`}>
        <div className="container">
          <Link to="/" className="logo" aria-label={settings.store_name}>
            <Logo />
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
              Cart <span key={count} className="badge-count bump">{count}</span>
            </NavLink>
          </nav>
        </div>
      </header>

      <main key={pathname} className="page-fade">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container stack">
          <div className="footer-top">
            <div className="logo">
              <Logo />
            </div>
            <div className="footer-follow">
              <span className="small caps">Follow us</span>
              <Socials />
            </div>
          </div>
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
      <WillsBot />
      {promotions.length > 0 && (
        <>
          <OfferDock promotions={promotions} products={products} />
          <OfferPopup promotions={promotions} products={products} />
        </>
      )}
    </>
  );
}
