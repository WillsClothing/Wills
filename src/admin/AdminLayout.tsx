import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useOutletContext } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { checkIsAdmin, signIn, signOut } from '../lib/api';
import { isConfigured, supabase } from '../lib/supabase';

export interface AdminContext {
  notify: (message: string) => void;
}

export function useAdmin() {
  return useOutletContext<AdminContext>();
}

export default function AdminLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    if (!session) {
      setIsAdmin(false);
      setChecking(false);
      return;
    }
    setChecking(true);
    checkIsAdmin()
      .then(setIsAdmin)
      .catch(() => setIsAdmin(false))
      .finally(() => setChecking(false));
  }, [session]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!isConfigured) return <SetupNeeded />;
  if (checking) return <div className="login-wrap">Loading…</div>;
  if (!session) return <Login />;
  if (!isAdmin) {
    return (
      <div className="login-wrap">
        <div className="login-card stack">
          <h1 style={{ fontSize: '1.2rem' }}>Not authorised</h1>
          <p className="small">
            {session.user.email} is signed in but is not an administrator. Ask the store owner to add this account to the
            admins list.
          </p>
          <button className="btn btn-block" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <Link to="/admin" className="logo">
          Wills Admin
        </Link>
        <NavLink to="/admin" end>
          Products
        </NavLink>
        <NavLink to="/admin/inventory">Inventory</NavLink>
        <NavLink to="/admin/settings">Settings</NavLink>
        <a href="/" target="_blank" rel="noreferrer">
          View shop ↗
        </a>
        <div className="side-foot stack">
          <div>{session.user.email}</div>
          <button className="link-btn" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet context={{ notify: setToast } satisfies AdminContext} />
        <div className="row" style={{ marginTop: 40 }}>
          <button className="link-btn small muted" onClick={() => signOut()}>
            Sign out ({session.user.email})
          </button>
        </div>
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card stack" onSubmit={submit}>
        <div className="logo center">Wills</div>
        <p className="small caps center muted">Admin sign in</p>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {error && <p className="small error">{error}</p>}
        <button className="btn btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="center small">
          <Link to="/">← Back to shop</Link>
        </p>
      </form>
    </div>
  );
}

function SetupNeeded() {
  return (
    <div className="login-wrap">
      <div className="login-card stack" style={{ maxWidth: 520 }}>
        <h1 style={{ fontSize: '1.2rem' }}>Admin portal not connected yet</h1>
        <p className="small">
          The admin portal needs a Supabase project. Create one for free, run <code>supabase/schema.sql</code>, then set{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>. The README walks through every step.
        </p>
        <Link to="/" className="btn btn-outline btn-block">
          Back to shop
        </Link>
      </div>
    </div>
  );
}
