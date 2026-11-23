import { useCallback, useEffect, useRef, useState } from 'react';
import { useEdgeSwipeBack } from './lib/swipe.js';
import { supabase } from './lib/supabase.js';
import Auth from './components/Auth.jsx';
import Home from './components/Home.jsx';
import Profile from './components/Profile.jsx';
import ParlayBuilder from './components/ParlayBuilder.jsx';
import ParlayView from './components/ParlayView.jsx';
import GameView from './components/GameView.jsx';
import BottomNav from './components/BottomNav.jsx';
import Splash from './components/Splash.jsx';
import Legal from './components/Legal.jsx';
import AgeGate from './components/AgeGate.jsx';
import Rooms from './components/Rooms.jsx';
import RoomView from './components/RoomView.jsx';
import { Avatar } from './lib/profile.jsx';
import { capturePendingJoin, takePendingJoin, joinRoom } from './lib/rooms.js';

capturePendingJoin();

export default function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [splash, setSplash] = useState(true);
  const [legal, setLegal] = useState(() => (['#privacy', '#terms'].includes(window.location.hash) ? window.location.hash.slice(1) : null));
  useEffect(() => {
    const onHash = () => setLegal(['#privacy', '#terms'].includes(window.location.hash) ? window.location.hash.slice(1) : null);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const closeLegal = () => {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    setLegal(null);
  };
  const endSplash = useCallback(() => setSplash(false), []);
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
  const BASE = { list: 0, rooms: 0, profile: 0, new: 1, room: 1, parlay: 1, game: 2 };
  const depth = (v) => BASE[v.name] + (v.from ? 1 : 0);
  const TAB = { list: 0, rooms: 1, profile: 2 };
  const [anim, setAnim] = useState({ key: 0, dir: 'none' });
  const viewRef = useRef(view);

  function go(next) {
    const prev = viewRef.current;
    let dir = 'forward';
    if (depth(next) < depth(prev)) dir = 'back';
    else if (depth(next) === depth(prev) && next.name in TAB && prev.name in TAB)
      dir = TAB[next.name] < TAB[prev.name] ? 'back' : 'forward';
    if (next.name === prev.name && next.id === prev.id) dir = 'none';
    viewRef.current = next;
    setAnim((a) => ({ key: a.key + 1, dir }));
    setView(next);
  }

  // Where "back" goes from each page (used by the edge swipe).
  function backTarget(v) {
    if (v.name === 'game') return { name: 'parlay', id: v.parlayId, from: v.from };
    if (v.name === 'parlay' && v.from) return v.from;
    if (v.name === 'room') return { name: 'rooms' };
    if (v.name === 'parlay' || v.name === 'new') return { name: 'list' };
    return null;
  }
  const pageRef = useRef(null);
  useEdgeSwipeBack(pageRef, () => backTarget(viewRef.current), (target) => go(target));

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  // Invite links (#join/CODE): join as soon as someone is signed in and past the age check.
  const [joinError, setJoinError] = useState('');
  const ageOk = !!user?.user_metadata?.age_confirmed_at;
  useEffect(() => {
    const onHash = () => {
      capturePendingJoin();
      if (user && ageOk) tryJoin();
    };
    function tryJoin() {
      const code = takePendingJoin();
      if (!code) return;
      joinRoom(user, code)
        .then((room) => go({ name: 'room', id: room.id }))
        .catch((e) => {
          setJoinError(e.message);
          go({ name: 'rooms' });
        });
    }
    if (user && ageOk) tryJoin();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, ageOk]);

  // The splash plays over whatever loads underneath, then fades into it.
  const splashLayer = splash ? <Splash onDone={endSplash} /> : null;
  if (legal) return <div className="app"><Legal page={legal} onBack={closeLegal} /></div>;
  if (!ready) return splashLayer || <div className="boot-blank" />;
  if (!session)
    return (
      <>
        <Auth />
        {splashLayer}
      </>
    );

  if (user && !user.user_metadata?.age_confirmed_at) return <AgeGate onConfirmed={setUser} />;
  const showNav = view.name === 'list' || view.name === 'profile' || view.name === 'rooms';

  return (
    <>
    {splashLayer}
    <div className={`app ${showNav ? 'with-nav' : ''}`}>
      <header className="topbar">
        <button className="brand" onClick={() => go({ name: 'list' })} aria-label="Sweatr home">
          <img src="/wordmark.svg" alt="Sweatr" className="wordmark-img" />
        </button>
        <button className={`topbar-me ${view.name === 'profile' ? 'on' : ''}`} onClick={() => go({ name: 'profile' })} aria-label="Your profile">
          <Avatar user={user} size={36} />
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
        {view.name === 'rooms' && (
          <>
            {joinError && <p className="error">{joinError}</p>}
            <Rooms user={user} onOpen={(id) => go({ name: 'room', id })} />
          </>
        )}
        {view.name === 'room' && (
          <RoomView
            user={user}
            id={view.id}
            onBack={() => go({ name: 'rooms' })}
            onOpenSlip={(pid) => go({ name: 'parlay', id: pid, from: { name: 'room', id: view.id } })}
          />
        )}
        {view.name === 'new' && (
          <ParlayBuilder onCancel={() => go({ name: 'list' })} onSaved={(id) => go({ name: 'parlay', id })} />
        )}
        {view.name === 'parlay' && (
          <ParlayView
            id={view.id}
            userId={user.id}
            backLabel={view.from ? 'Back to room' : 'All parlays'}
            onBack={() => go(view.from || { name: 'list' })}
            onOpenGame={(league, gameId, date, legs) =>
              go({ name: 'game', parlayId: view.id, from: view.from, league, gameId, date, legs })
            }
          />
        )}
        {view.name === 'game' && (
          <GameView
            league={view.league}
            gameId={view.gameId}
            date={view.date}
            legs={view.legs}
            onBack={() => go({ name: 'parlay', id: view.parlayId, from: view.from })}
          />
        )}
      </main>
      {showNav && (
        <BottomNav
          active={view.name === 'rooms' ? 'rooms' : view.name === 'profile' ? 'profile' : 'home'}
          onHome={() => go({ name: 'list' })}
          onScan={() => go({ name: 'new' })}
          onRooms={() => go({ name: 'rooms' })}
        />
      )}
    </div>
    </>
  );
}
