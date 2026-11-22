import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase.js';
import Auth from './components/Auth.jsx';
import ParlayList from './components/ParlayList.jsx';
import ParlayBuilder from './components/ParlayBuilder.jsx';
import ParlayView from './components/ParlayView.jsx';

export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  // view: { name: 'list' } | { name: 'new' } | { name: 'parlay', id }
  const [view, setView] = useState({ name: 'list' });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="center muted">Loading…</div>;
  if (!session) return <Auth />;

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView({ name: 'list' })}>
          Sweatr
        </button>
        <button className="link" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      <main>
        {view.name === 'list' && (
          <ParlayList onNew={() => setView({ name: 'new' })} onOpen={(id) => setView({ name: 'parlay', id })} />
        )}
        {view.name === 'new' && (
          <ParlayBuilder
            onCancel={() => setView({ name: 'list' })}
            onSaved={(id) => setView({ name: 'parlay', id })}
          />
        )}
        {view.name === 'parlay' && <ParlayView id={view.id} onBack={() => setView({ name: 'list' })} />}
      </main>
    </div>
  );
}
