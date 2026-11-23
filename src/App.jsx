import { useEffect, useRef, useState } from 'react';
import { useEdgeSwipeBack } from './lib/swipe.js';
import { supabase } from './lib/supabase.js';
import Auth from './components/Auth.jsx';
import Home from './components/Home.jsx';
import Profile from './components/Profile.jsx';
import ParlayBuilder from './components/ParlayBuilder.jsx';
import ParlayView from './components/ParlayView.jsx';
import GameView from './components/GameView.jsx';
import BottomNav from './components/BottomNav.jsx';

export default function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  // view: list | new | profile | { parlay } | { game }
  const [view, setView] = useState({ name: 'list' });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user || null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user || null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Page transitions: deeper pages slide in from the right, going back slides in from the left.
  const DEPTH = { list: 0, profile: 0, new: 1, parlay: 1, game: 2 };
  const TAB = { list: 0, profile: 1 };
  const [anim, setAnim] = useState({ key: 0, dir: 'none' });
  const viewRef = useRef(view);

  function go(next) {
    const prev = viewRef.current;
    let dir = 'forward';
    if (DEPTH[next.name] < DEPTH[prev.name]) dir = 'back';
    else if (DEPTH[next.name] === DEPTH[prev.name] && next.name in TAB && prev.name in TAB)
      dir = TAB[next.name] < TAB[prev.name] ? 'back' : 'forward';
    if (next.name === prev.name && next.id === prev.id) dir = 'none';
    viewRef.current = next;
    setAnim((a) => ({ key: a.key + 1, dir }));
    setView(next);
  }

  // Where "back" goes from each page (used by the edge swipe).
  function backTarget(v) {
    if (v.name === 'game') return { name: 'parlay', id: v.parlayId };
    if (v.name === 'parlay' || v.name === 'new') return { name: 'list' };
    return null;
  }
  const pageRef = useRef(null);
  useEdgeSwipeBack(pageRef, () => backTarget(viewRef.current), (target) => go(target));

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  if (!ready) return <div className="center muted boot">SWEATR</div>;
  if (!session) return <Auth />;

  const showNav = view.name === 'list' || view.name === 'profile';

  return (
    <div className={`app ${showNav ? 'with-nav' : ''}`}>
      <header className="topbar">
        <button className="brand" onClick={() => go({ name: 'list' })} aria-label="Sweatr home">
          <img src="/wordmark.svg" alt="Sweatr" className="wordmark-img" />
        </button>
      </header>
      <main ref={pageRef} key={anim.key} className={`page page-${anim.dir}`}>
        {view.name === 'list' && (
          <Home
            user={user}
            onNew={() => go({ name: 'new' })}
            onOpen={(id) => go({ name: 'parlay', id })}
            onProfile={() => go({ name: 'profile' })}
          />
        )}
        {view.name === 'profile' && <Profile user={user} onUserChange={setUser} />}
        {view.name === 'new' && (
          <ParlayBuilder onCancel={() => go({ name: 'list' })} onSaved={(id) => go({ name: 'parlay', id })} />
        )}
        {view.name === 'parlay' && (
          <ParlayView
            id={view.id}
            onBack={() => go({ name: 'list' })}
            onOpenGame={(league, gameId, date, legs) => go({ name: 'game', parlayId: view.id, league, gameId, date, legs })}
          />
        )}
        {view.name === 'game' && (
          <GameView
            league={view.league}
            gameId={view.gameId}
            date={view.date}
            legs={view.legs}
            onBack={() => go({ name: 'parlay', id: view.parlayId })}
          />
        )}
      </main>
      {showNav && (
        <BottomNav
          active={view.name === 'profile' ? 'profile' : 'home'}
          onHome={() => go({ name: 'list' })}
          onScan={() => go({ name: 'new' })}
          onProfile={() => go({ name: 'profile' })}
        />
      )}
    </div>
  );
}
