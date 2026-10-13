import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatPrice } from '../lib/format';
import { fetchInvoices, INVOICE_STATUS_LABELS, type Invoice } from '../lib/invoices';
import { useStore } from '../lib/store';
import { PAYMENT_LABELS } from '../lib/whatsapp';
import { invoiceDate } from './InvoiceDoc';

/** Every invoice, newest first, with what is still to be collected. */
export default function Invoices() {
  const { settings } = useStore();
  const money = (n: number) => formatPrice(n, settings.currency);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    fetchInvoices()
      .then(setInvoices)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load invoices'));
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!invoices || !s) return invoices ?? [];
    return invoices.filter((i) =>
      [i.number, i.customer_name, i.customer_phone, ...i.items.map((it) => it.name)].some((x) => x.toLowerCase().includes(s)),
    );
  }, [invoices, q]);

  const due = (invoices ?? []).filter((i) => i.status === 'unpaid');

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Invoices</h1>
        <Link to="/admin/invoices/new" className="btn btn-gold">
          + New invoice
        </Link>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Make an invoice for each order you send. It takes the pieces out of stock by colour and size, and you can print it, save it as a PDF or
        send it on WhatsApp.
      </p>
      {error && <p className="error">{error}</p>}
      {invoices && (
        <>
          {due.length > 0 && (
            <p className="invoice-due">
              {money(due.reduce((n, i) => n + i.total, 0))} still to collect on {due.length} {due.length === 1 ? 'invoice' : 'invoices'}.
            </p>
          )}
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by invoice no., customer, phone or product" />
          {shown.length === 0 ? (
            <p className="muted">{invoices.length ? 'No invoices match.' : 'No invoices yet. Create one when you send an order.'}</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Pieces</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <Link to={`/admin/invoices/${i.id}`} className="mono">
                          {i.number}
                        </Link>
                      </td>
                      <td className="small">{invoiceDate(i.created_at)}</td>
                      <td>{i.customer_name}</td>
                      <td>{i.items.reduce((n, it) => n + it.qty, 0)}</td>
                      <td>{money(i.total)}</td>
                      <td className="small">{PAYMENT_LABELS[i.payment_method]}</td>
                      <td>
                        <span className={`inv-status ${i.status}`}>{INVOICE_STATUS_LABELS[i.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {!invoices && !error && <p className="muted">Loading…</p>}
    </div>
  );
}
