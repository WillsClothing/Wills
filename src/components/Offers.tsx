import { formatPrice } from '../lib/format';
import { useStore } from '../lib/store';
import type { Product, Promotion } from '../lib/types';
import { whatsappLink } from '../lib/whatsapp';
import Reveal from './Reveal';
import WhatsAppIcon from './WhatsAppIcon';

/** "Special offers" band. Only rendered while at least one promotion is live. */
export default function Offers({ promotions, products }: { promotions: Promotion[]; products: Product[] }) {
  const { settings } = useStore();
  const money = (n: number) => formatPrice(n, settings.currency);

  return (
    <section className="offers" id="offers">
      <div className="container">
        <Reveal className="offers-head">
          <p className="eyebrow">Limited time</p>
          <h2>Special offers</h2>
        </Reveal>
        <div className={`offers-grid ${promotions.length === 1 ? 'single' : ''}`}>
          {promotions.map((promo, i) => {
            const items = promo.product_ids.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p);
            const pictures = promo.image ? [promo.image] : items.map((p) => p.images[0]).filter(Boolean).slice(0, 3);
            const save =
              promo.compare_price && promo.compare_price > promo.price
                ? Math.round(((promo.compare_price - promo.price) / promo.compare_price) * 100)
                : 0;
            const message = [
              `Hello ${settings.store_name}, I'd like the "${promo.title}" offer (${money(promo.price)}).`,
              items.length ? `Items: ${items.map((p) => p.name).join(' + ')}` : '',
              'My sizes: ',
            ]
              .filter(Boolean)
              .join('\n');

            return (
              <Reveal key={promo.id} delay={i * 120} className="offer-card">
                <div className={`offer-media n${pictures.length}`}>
                  {pictures.length ? pictures.map((src) => <img key={src} src={src} alt="" />) : <span className="offer-mono">{promo.title.slice(0, 1)}</span>}
                  {save > 0 && <span className="offer-save">Save {save}%</span>}
                </div>
                <div className="offer-body">
                  <h3>{promo.title}</h3>
                  {promo.description && <p className="offer-desc">{promo.description}</p>}
                  {items.length > 0 && (
                    <ul className="offer-items">
                      {items.map((p) => (
                        <li key={p.id}>{p.name}</li>
                      ))}
                    </ul>
                  )}
                  <div className="offer-foot">
                    <div className="offer-price">
                      <strong>{money(promo.price)}</strong>
                      {save > 0 && <s>{money(promo.compare_price!)}</s>}
                    </div>
                    {settings.whatsapp_number && (
                      <a className="btn btn-gold btn-sm" href={whatsappLink(settings.whatsapp_number, message)} target="_blank" rel="noreferrer">
                        <WhatsAppIcon size={16} /> Claim offer
                      </a>
                    )}
                  </div>
                  {promo.ends_on && <p className="offer-ends">Ends {new Date(`${promo.ends_on}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</p>}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
