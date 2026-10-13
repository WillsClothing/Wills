import Logo from '../components/Logo';
import { formatPrice } from '../lib/format';
import { INVOICE_STATUS_LABELS, type Invoice } from '../lib/invoices';
import type { StoreSettings } from '../lib/types';
import { cleanNumber, PAYMENT_LABELS } from '../lib/whatsapp';

export const INSTAGRAM_HANDLE = '@wills.clothing_';

/** "+94 77 754 3943" style for a Sri Lankan number; anything else as +digits. */
export function displayPhone(n: string): string {
  const d = cleanNumber(n);
  if (/^94\d{9}$/.test(d)) return `+94 ${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return d ? `+${d}` : '';
}

export function invoiceDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** The invoice itself: an A4 page with the Wills header, customer, items, totals and payment details. */
export default function InvoiceDoc({ invoice, settings }: { invoice: Invoice; settings: StoreSettings }) {
  const money = (n: number) => formatPrice(n, settings.currency);
  const site = typeof window !== 'undefined' ? window.location.host : '';
  const pieces = invoice.items.reduce((n, i) => n + i.qty, 0);
  const stamp = invoice.status === 'paid' ? 'Paid' : invoice.status === 'cancelled' ? 'Cancelled' : '';

  return (
    <article className={`invoice ${invoice.status}`}>
      <header className="invoice-head">
        <div className="invoice-brand">
          <Logo className="invoice-logo" />
          <p>Right time, right now</p>
        </div>
        <div className="invoice-title">
          <h1>Invoice</h1>
          <p className="invoice-no">{invoice.number}</p>
        </div>
      </header>

      <section className="invoice-parties">
        <div>
          <h4>From</h4>
          <strong>{settings.store_name}</strong>
          {settings.whatsapp_number && <span>WhatsApp: {displayPhone(settings.whatsapp_number)}</span>}
          <span>Instagram: {INSTAGRAM_HANDLE}</span>
          <span>Facebook: Wills Clothing</span>
          {site && <span>{site}</span>}
        </div>
        <div>
          <h4>Bill to</h4>
          <strong>{invoice.customer_name || 'Customer'}</strong>
          {invoice.customer_phone && <span>{displayPhone(invoice.customer_phone)}</span>}
          {invoice.customer_address && <span className="invoice-address">{invoice.customer_address}</span>}
        </div>
        <dl className="invoice-meta">
          <dt>Invoice no.</dt>
          <dd>{invoice.number}</dd>
          <dt>Date</dt>
          <dd>{invoiceDate(invoice.created_at)}</dd>
          <dt>Payment</dt>
          <dd>{PAYMENT_LABELS[invoice.payment_method]}</dd>
          <dt>Status</dt>
          <dd>{INVOICE_STATUS_LABELS[invoice.status]}</dd>
        </dl>
      </section>

      <table className="invoice-items">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th className="num">Qty</th>
            <th className="num">Unit price</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it, n) => (
            <tr key={`${it.size_id}-${n}`}>
              <td>{n + 1}</td>
              <td>
                <strong>{it.name}</strong>
                <span className="invoice-variant">
                  {[it.color && `Colour: ${it.color}`, `Size: ${it.size}`].filter(Boolean).join(' · ')}
                </span>
                {it.sku && <span className="invoice-sku">SKU {it.sku}</span>}
              </td>
              <td className="num">{it.qty}</td>
              <td className="num">{money(it.unit_price)}</td>
              <td className="num">{money(it.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="invoice-bottom">
        <div className="invoice-payment">
          {stamp && <div className={`invoice-stamp ${invoice.status}`}>{stamp}</div>}
          <h4>Payment</h4>
          {invoice.payment_method === 'cod' ? (
            <p>
              {invoice.status === 'paid'
                ? 'Paid in cash on delivery. Thank you.'
                : `Cash on Delivery: please pay ${money(invoice.total)} to the courier when your order arrives.`}
            </p>
          ) : (
            <>
              <p>{invoice.status === 'paid' ? 'Paid by bank transfer. Thank you.' : `Bank transfer of ${money(invoice.total)} to:`}</p>
              {invoice.status !== 'paid' && settings.bank_details && <pre className="invoice-bank">{settings.bank_details}</pre>}
            </>
          )}
          {invoice.notes && (
            <>
              <h4>Notes</h4>
              <p>{invoice.notes}</p>
            </>
          )}
        </div>
        <dl className="invoice-totals">
          <dt>
            Subtotal ({pieces} {pieces === 1 ? 'piece' : 'pieces'})
          </dt>
          <dd>{money(invoice.subtotal)}</dd>
          {invoice.discount > 0 && (
            <>
              <dt>Discount</dt>
              <dd>− {money(invoice.discount)}</dd>
            </>
          )}
          <dt>Delivery (island wide)</dt>
          <dd>FREE</dd>
          <dt className="grand">Total</dt>
          <dd className="grand">{money(invoice.total)}</dd>
        </dl>
      </section>

      <footer className="invoice-foot">
        <p className="invoice-thanks">Thank you for shopping with {settings.store_name}.</p>
        <p>
          Questions about this order? Message us on WhatsApp{settings.whatsapp_number ? ` at ${displayPhone(settings.whatsapp_number)}` : ''} and
          quote {invoice.number}.
        </p>
      </footer>
    </article>
  );
}
