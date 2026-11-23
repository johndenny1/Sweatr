import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { MIN_AGE } from '../lib/legal.js';
import Footer from './Footer.jsx';

export default function Auth() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [adult, setAdult] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    if (mode === 'signup' && !adult) {
      setBusy(false);
      return setMessage(`You must be ${MIN_AGE} or older to use Sweatr.`);
    }
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { age_confirmed_at: new Date().toISOString(), terms_accepted_at: new Date().toISOString() } },
          });
    setBusy(false);
    if (error) return setMessage(error.message);
    if (mode === 'signup' && !data.session) setMessage('Check your email to confirm your account, then sign in.');
  }

  return (
    <div className="auth">
      <h1 className="logo">
        <img src="/wordmark.svg" alt="Sweatr" className="wordmark-img big" />
      </h1>
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
        {mode === 'signup' && (
          <label className="check-row">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
            <span>
              I'm {MIN_AGE} or older and agree to the <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.
            </span>
          </label>
        )}
        <button className="primary" disabled={busy || (mode === 'signup' && !adult)}>
          {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        {message && <p className="note">{message}</p>}
      </form>
      <button className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
      <Footer />
    </div>
  );
}
