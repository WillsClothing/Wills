import { sortSizes } from './format';
import type { InventoryLogEntry, Product } from './types';

/** Stock removed with one of these reasons counts as a sale in the report. */
export const SALE_REASONS = ['Sale', 'Shipment sent'];

export interface SalesLine {
  product: string;
  size: string;
  units: number;
  unitPrice: number;
  value: number;
}

export interface DayTotal {
  date: string;
  units: number;
  value: number;
}

export interface Report {
  start: string;
  end: string;
  unitsSold: number;
  salesValue: number;
  orders: number;
  restocked: number;
  returned: number;
  damaged: number;
  corrections: number;
  sales: SalesLine[];
  byDay: DayTotal[];
  byReason: { reason: string; changes: number; units: number }[];
  log: InventoryLogEntry[];
  stock: { product: string; category: string; status: string; size: string; stock: number }[];
}

const isSale = (l: InventoryLogEntry) => l.change < 0 && SALE_REASONS.includes(l.reason);

const pad = (n: number) => String(n).padStart(2, '0');

/** yyyy-mm-dd in local time. */
export function dateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayString(): string {
  return dateString(new Date());
}

function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Local midnight at the start of `start` to midnight after `end` (both yyyy-mm-dd, inclusive). */
export function periodRange(start: string, end: string): [Date, Date] {
  const to = parseDate(end);
  return [parseDate(start), new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1)];
}

export type Preset = 'today' | 'yesterday' | 'week' | 'last7' | 'month' | 'lastMonth';

export const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
];

/** Start and end dates for a quick time frame. Weeks start on Monday. */
export function presetRange(preset: Preset, now = new Date()): [string, string] {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const day = (offset: number) => dateString(new Date(y, m, d + offset));
  switch (preset) {
    case 'today':
      return [day(0), day(0)];
    case 'yesterday':
      return [day(-1), day(-1)];
    case 'week':
      return [day(-((now.getDay() + 6) % 7)), day(0)];
    case 'last7':
      return [day(-6), day(0)];
    case 'month':
      return [dateString(new Date(y, m, 1)), day(0)];
    case 'lastMonth':
      return [dateString(new Date(y, m - 1, 1)), dateString(new Date(y, m, 0))];
  }
}

export function buildReport(start: string, end: string, log: InventoryLogEntry[], products: Product[]): Report {
  const byId = new Map(products.map((p) => [p.id, p]));
  const byName = new Map(products.map((p) => [p.name, p]));
  const priceOf = (l: InventoryLogEntry) => (l.product_id && byId.get(l.product_id)?.price) || byName.get(l.product_name)?.price || 0;

  const salesMap = new Map<string, SalesLine>();
  for (const l of log.filter(isSale)) {
    const key = `${l.product_name}\u0000${l.size}`;
    const line = salesMap.get(key) ?? { product: l.product_name, size: l.size, units: 0, unitPrice: priceOf(l), value: 0 };
    line.units += -l.change;
    line.value = line.units * line.unitPrice;
    salesMap.set(key, line);
  }
  const sales = [...salesMap.values()].sort((a, b) => b.value - a.value || a.product.localeCompare(b.product));

  const reasonMap = new Map<string, { reason: string; changes: number; units: number }>();
  for (const l of log) {
    const reason = l.reason || 'Other';
    const r = reasonMap.get(reason) ?? { reason, changes: 0, units: 0 };
    r.changes += 1;
    r.units += l.change;
    reasonMap.set(reason, r);
  }

  const sumWhere = (reason: string, sign: 1 | -1) =>
    log.filter((l) => l.reason === reason && Math.sign(l.change) === sign).reduce((n, l) => n + Math.abs(l.change), 0);

  const dayMap = new Map<string, DayTotal>();
  for (const l of log.filter(isSale)) {
    const date = dateString(new Date(l.created_at));
    const t = dayMap.get(date) ?? { date, units: 0, value: 0 };
    t.units += -l.change;
    t.value += -l.change * priceOf(l);
    dayMap.set(date, t);
  }

  return {
    start,
    end,
    unitsSold: sales.reduce((n, s) => n + s.units, 0),
    salesValue: sales.reduce((n, s) => n + s.value, 0),
    orders: log.filter(isSale).length,
    restocked: sumWhere('Restock', 1),
    returned: sumWhere('Return', 1),
    damaged: sumWhere('Damaged', -1),
    corrections: log.filter((l) => l.reason === 'Stock count correction').length,
    sales,
    byDay: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byReason: [...reasonMap.values()],
    log,
    stock: products.flatMap((p) =>
      sortSizes(p.product_sizes).map((s) => ({ product: p.name, category: p.category, status: p.status, size: s.size, stock: s.stock })),
    ),
  };
}

function cell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A CSV with labelled sections; opens directly in Excel or Google Sheets. */
export function reportToCsv(r: Report, storeName: string, currency: string): string {
  const rows: (string | number)[][] = [];
  const blank = () => rows.push([]);
  const period = r.start === r.end ? r.start : `${r.start} to ${r.end}`;
  rows.push([`${storeName} sales report`, period]);
  rows.push(['Generated', new Date().toLocaleString()]);
  blank();
  rows.push(['SUMMARY']);
  rows.push(['Units sold', r.unitsSold]);
  rows.push([`Sales value (${currency})`, r.salesValue]);
  rows.push(['Sale entries', r.orders]);
  rows.push(['Units restocked', r.restocked]);
  rows.push(['Units returned', r.returned]);
  rows.push(['Units damaged', r.damaged]);
  rows.push(['Stock count corrections', r.corrections]);
  rows.push(['Total stock changes', r.log.length]);
  blank();
  rows.push(['SALES BY PRODUCT']);
  rows.push(['Product', 'Size', 'Units', `Unit price (${currency})`, `Value (${currency})`]);
  r.sales.forEach((s) => rows.push([s.product, s.size, s.units, s.unitPrice, s.value]));
  if (!r.sales.length) rows.push(['No sales recorded']);
  blank();
  if (r.start !== r.end) {
    rows.push(['SALES BY DAY']);
    rows.push(['Date', 'Units', `Value (${currency})`]);
    r.byDay.forEach((d) => rows.push([d.date, d.units, d.value]));
    if (!r.byDay.length) rows.push(['No sales recorded']);
    blank();
  }
  rows.push(['CHANGES BY REASON']);
  rows.push(['Reason', 'Changes', 'Net units']);
  r.byReason.forEach((b) => rows.push([b.reason, b.changes, b.units]));
  blank();
  rows.push(['ALL STOCK CHANGES']);
  rows.push(['Date', 'Time', 'Product', 'Size', 'Change', 'New stock', 'Reason']);
  r.log.forEach((l) => rows.push([dateString(new Date(l.created_at)), new Date(l.created_at).toLocaleTimeString(), l.product_name, l.size, l.change, l.new_stock, l.reason]));
  if (!r.log.length) rows.push(['No stock changes in this period']);
  blank();
  rows.push(['STOCK AT TIME OF DOWNLOAD']);
  rows.push(['Product', 'Type', 'Status', 'Size', 'In stock']);
  r.stock.forEach((s) => rows.push([s.product, s.category, s.status.replace('_', ' '), s.size, s.stock]));
  return '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

export function downloadFile(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
