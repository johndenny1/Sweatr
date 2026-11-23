import { HomeIcon, CameraIcon, RoomsIcon, StatsIcon, CalendarIcon } from './Icons.jsx';

export default function BottomNav({ active, onHome, onScan, onRooms, onCalendar, onProfile }) {
  const item = (id, label, Icon, onClick) => (
    <button className={`nav-item ${active === id ? 'on' : ''}`} onClick={onClick}>
      <Icon />
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="bottom-nav five">
      {item('home', 'Slips', HomeIcon, onHome)}
      {item('rooms', 'Rooms', RoomsIcon, onRooms)}
      <button className="nav-scan" onClick={onScan} aria-label="Scan a bet slip">
        <CameraIcon width={30} height={30} />
      </button>
      {item('calendar', 'Calendar', CalendarIcon, onCalendar)}
      {item('profile', 'My stats', StatsIcon, onProfile)}
    </nav>
  );
}
