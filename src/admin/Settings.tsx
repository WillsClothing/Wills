import { useEffect, useState, type FormEvent } from 'react';
import { fetchSettings, updateSettings } from '../lib/api';
import type { StoreSettings } from '../lib/types';
import { cleanNumber, whatsappLink } from '../lib/whatsapp';
import { useAdmin } from './AdminLayout';

export default function Settings() {
  const { notify } = useAdmin();
  const [form, setForm] = useState<StoreSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings()
      .then(setForm)
      .catch((e) => setError(e.message));
  }, []);

  if (!form) return error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>;

  function set<K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const number = cleanNumber(form.whatsapp_number);
    if (number && number.length < 8) return setError('Enter the full WhatsApp number with country code.');
    setSaving(true);
    setError(null);
    try {
      const next = { ...form, whatsapp_number: number };
      await updateSettings(next);
      setForm(next);
      notify('Settings saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const number = cleanNumber(form.whatsapp_number);

  return (
    <form className="stack" onSubmit={submit} style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Store settings</h1>
      <section className="panel stack">
        <label className="field">
          <span>Store name</span>
          <input className="input" value={form.store_name} onChange={(e) => set('store_name', e.target.value)} required />
        </label>
        <label className="field">
          <span>WhatsApp number for orders *</span>
          <input
            className="input"
            type="tel"
            value={form.whatsapp_number}
            onChange={(e) => set('whatsapp_number', e.target.value)}
            placeholder="Country code + number, e.g. 94771234567"
          />
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          Include the country code, no leading 0 or +. Orders and the contact button go to this number.
          {number && (
            <>
              {' '}
              <a href={whatsappLink(number, 'Test message from the Wills Clothing website')} target="_blank" rel="noreferrer">
                Send a test message
              </a>
            </>
          )}
        </p>
        <label className="field">
          <span>Currency label</span>
          <input className="input" value={form.currency} onChange={(e) => set('currency', e.target.value)} placeholder="e.g. Rs., LKR, $" />
        </label>
        <label className="field">
          <span>Bank transfer details</span>
          <textarea
            className="input"
            rows={5}
            value={form.bank_details}
            onChange={(e) => set('bank_details', e.target.value)}
            placeholder={'Bank: …\nAccount name: …\nAccount number: …\nBranch: …'}
          />
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          Shown to customers who choose bank transfer at checkout.
        </p>
        <label className="field">
          <span>Delivery note (optional)</span>
          <input className="input" value={form.delivery_note} onChange={(e) => set('delivery_note', e.target.value)} placeholder="e.g. Island-wide delivery in 3–5 days" />
        </label>
      </section>
      {error && <p className="error">{error}</p>}
      <div>
        <button className="btn" disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
  );
}
