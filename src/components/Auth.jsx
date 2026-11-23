import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function Auth() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const fn = mode === 'signin' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { data, error } = await fn.call(supabase.auth, { email, password });
    setBusy(false);
    if (error) return setMessage(error.message);
    if (mode === 'signup' && !data.session) setMessage('Check your email to confirm your account, then sign in.');
  }

  return (
    <div className="auth">
      <img src="/icon.svg" alt="" className="auth-icon" />
      <h1 className="logo">Sweatr</h1>
      <p className="muted">Follow every leg of your parlay live.</p>
      <form onSubmit={submit} className="card stack">
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          placeholder="Password"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="primary" disabled={busy}>
          {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        {message && <p className="note">{message}</p>}
      </form>
      <button className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </div>
  );
}
