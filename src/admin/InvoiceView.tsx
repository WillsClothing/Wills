import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useParams } from 'react-router-dom';
import { formatPrice } from '../lib/format';
import { cancelInvoice, fetchInvoice, setInvoicePaid, type Invoice } from '../lib/invoices';
import { useStore } from '../lib/store';
import { cleanNumber, PAYMENT_LABELS, whatsappLink } from '../lib/whatsapp';
import { useAdmin } from './AdminLayout';
import InvoiceDoc, { invoiceDate } from './InvoiceDoc';

/** Local "077 123 4567" becomes "94771234567" for wa.me. */
function waNumber(phone: string): string {
  const d = cleanNumber(phone);
  return /^0\d{9}$/.test(d) ? `94${d.slice(1)}` : d;
}

function whatsappMessage(inv: Invoice, storeName: string, currency: string): string {
  const money = (n: number) => formatPrice(n, currency);
  const lines = inv.items.map(
    (it, n) => `${n + 1}. ${it.name} (${[it.color, it.size].filter(Boolean).join(', ')}) × ${it.qty} = ${money(it.line_total)}`,
  );
  return [
    `Hello ${inv.customer_name || 'there'}, thank you for shopping with ${storeName}!`,
    '',
    `*Invoice ${inv.number}* · ${invoiceDate(inv.created_at)}`,
    ...lines,
    inv.discount > 0 ? `Discount: − ${money(inv.discount)}` : '',
    'Delivery: FREE (island wide)',
    `*Total: ${money(inv.total)}*`,
    `Payment: ${PAYMENT_LABELS[inv.payment_method]}${inv.status === 'paid' ? ' (paid, thank you)' : ''}`,
    '',
    'Your invoice is attached as a PDF.',
  ]
    .filter((l, i, all) => l !== '' || all[i - 1] !== '')
    .join('\n');
}

export default function InvoiceView() {
  const { id } = useParams();
  const location = useLocation();
  const { notify } = useAdmin();
  const { settings, reload: reloadShop } = useStore();
  const [invoice, setInvoice] = useState<Invoice | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const created = (location.state as { created?: boolean } | null)?.created;

  const load = useCallback(() => {
    if (!id) return;
    fetchInvoice(id)
      .then(setInvoice)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the invoice'));
  }, [id]);
  useEffect(load, [load]);

  // The browser names a saved PDF after the page title, so make it the invoice number.
  useEffect(() => {
    if (!invoice) return;
    const before = document.title;
    document.title = `${invoice.number} - ${settings.store_name}`;
    return () => {
      document.title = before;
    };
  }, [invoice, settings.store_name]);

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      notify(done);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  if (error && !invoice) return <p className="error">{error}</p>;
  if (invoice === undefined) return <p className="muted">Loading…</p>;
  if (invoice === null)
    return (
      <p>
        Invoice not found. <Link to="/admin/invoices">All invoices</Link>
      </p>
    );

  const waTo = waNumber(invoice.customer_phone);
  const pieces = invoice.items.reduce((n, i) => n + i.qty, 0);

  return (
    <div className="stack">
      <p className="small">
        <Link to="/admin/invoices">← All invoices</Link>
      </p>
      {created && (
        <p className="invoice-created">
          Invoice {invoice.number} created. {pieces} {pieces === 1 ? 'piece was' : 'pieces were'} taken out of stock.
        </p>
      )}
      <div className="row invoice-actions">
        <button type="button" className="btn btn-gold" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        {waTo && (
          <a className="btn" href={whatsappLink(waTo, whatsappMessage(invoice, settings.store_name, settings.currency))} target="_blank" rel="noreferrer">
            Send on WhatsApp
          </a>
        )}
        {invoice.status !== 'cancelled' && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => run(() => setInvoicePaid(invoice.id, invoice.status !== 'paid'), invoice.status === 'paid' ? 'Marked as payment due' : 'Marked as paid')}
          >
            {invoice.status === 'paid' ? 'Mark as not paid' : 'Mark as paid'}
          </button>
        )}
        {invoice.status !== 'cancelled' && (
          <button
            type="button"
            className="link-btn small danger"
            disabled={busy}
            onClick={() => {
              if (!confirm(`Cancel invoice ${invoice.number}? Its ${pieces} ${pieces === 1 ? 'piece goes' : 'pieces go'} back into stock.`)) return;
              run(async () => {
                await cancelInvoice(invoice.id);
                reloadShop();
              }, 'Invoice cancelled and stock returned');
            }}
          >
            Cancel invoice
          </button>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        To send the PDF: choose Print / Save as PDF, save it, then attach it in the WhatsApp chat.
      </p>
      {error && <p className="error">{error}</p>}

      <div className="invoice-paper">
        <InvoiceDoc invoice={invoice} settings={settings} />
      </div>
      {createPortal(
        <div className="print-root invoice-print">
          <InvoiceDoc invoice={invoice} settings={settings} />
        </div>,
        document.body,
      )}
    </div>
  );
}
