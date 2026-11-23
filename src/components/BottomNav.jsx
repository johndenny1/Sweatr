import { HomeIcon, CameraIcon, UserIcon } from './Icons.jsx';

export default function BottomNav({ active, onHome, onScan, onProfile }) {
  return (
    <nav className="bottom-nav">
      <button className={`nav-item ${active === 'home' ? 'on' : ''}`} onClick={onHome}>
        <HomeIcon />
        <span>Slips</span>
      </button>
      <button className="nav-scan" onClick={onScan} aria-label="Scan a bet slip">
        <CameraIcon width={30} height={30} />
      </button>
      <button className={`nav-item ${active === 'profile' ? 'on' : ''}`} onClick={onProfile}>
        <UserIcon />
        <span>Profile</span>
      </button>
    </nav>
  );
}
