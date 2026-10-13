import { supabase } from './supabase';
import type { PaymentMethod } from './types';

export type InvoiceStatus = 'unpaid' | 'paid' | 'cancelled';

export interface InvoiceItem {
  product_id: string;
  size_id: string;
  name: string;
  size: string;
  color: string;
  sku: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

export interface Invoice {
  id: string;
  seq: number;
  number: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  payment_method: PaymentMethod;
  status: InvoiceStatus;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  total: number;
  notes: string;
  created_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
}

export interface NewInvoice {
  customer: { name: string; phone: string; address: string };
  items: { size_id: string; qty: number; unit_price: number }[];
  payment: PaymentMethod;
  discount: number;
  notes: string;
  paid: boolean;
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  unpaid: 'Payment due',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

function db() {
  if (!supabase) throw new Error('Supabase is not configured. See README.md.');
  return supabase;
}

/** Turns "table/function missing" errors into the step that fixes them. */
function hint(error: { message: string }): Error {
  return /invoices|create_invoice|cancel_invoice/.test(error.message) && /exist|schema cache|could not find/i.test(error.message)
    ? new Error('Invoices are not set up in the database yet. Run supabase/invoices.sql in the Supabase SQL Editor, then try again.')
    : new Error(error.message);
}

function normalize(i: Invoice): Invoice {
  return {
    ...i,
    subtotal: Number(i.subtotal),
    discount: Number(i.discount),
    total: Number(i.total),
    items: (Array.isArray(i.items) ? i.items : []).map((it) => ({
      ...it,
      qty: Number(it.qty),
      unit_price: Number(it.unit_price),
      line_total: Number(it.line_total),
    })),
  };
}

export async function fetchInvoices(): Promise<Invoice[]> {
  const { data, error } = await db().from('invoices').select('*').order('seq', { ascending: false }).limit(500);
  if (error) throw hint(error);
  return (data as Invoice[]).map(normalize);
}

export async function fetchInvoice(id: string): Promise<Invoice | null> {
  const { data, error } = await db().from('invoices').select('*').eq('id', id).maybeSingle();
  if (error) throw hint(error);
  return data ? normalize(data as Invoice) : null;
}

/** Creates the invoice and takes its pieces out of stock in one step. Returns the new invoice id. */
export async function createInvoice(input: NewInvoice): Promise<string> {
  const { data, error } = await db().rpc('create_invoice', {
    p_customer: input.customer,
    p_items: input.items,
    p_payment: input.payment,
    p_discount: input.discount,
    p_notes: input.notes,
    p_paid: input.paid,
  });
  if (error) throw hint(error);
  return data as string;
}

export async function setInvoicePaid(id: string, paid: boolean): Promise<void> {
  const { error } = await db()
    .from('invoices')
    .update({ status: paid ? 'paid' : 'unpaid', paid_at: paid ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw hint(error);
}

/** Cancels the invoice and puts its pieces back in stock. */
export async function cancelInvoice(id: string): Promise<void> {
  const { error } = await db().rpc('cancel_invoice', { p_id: id });
  if (error) throw hint(error);
}
