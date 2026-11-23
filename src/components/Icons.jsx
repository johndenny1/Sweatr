const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const HomeIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </svg>
);

export const CameraIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </svg>
);

export const UserIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </svg>
);

export const ImageIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="16" rx="1" />
    <circle cx="9" cy="10" r="2" />
    <path d="m21 16-5-5-9 9" />
  </svg>
);

export const BoltIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </svg>
);

export const RoomsIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <circle cx="17" cy="9.5" r="2.4" />
    <path d="M2.5 20c1-3.6 3.6-5.5 6.5-5.5s5.5 1.9 6.5 5.5" />
    <path d="M15.5 14.6c2.6-.4 4.8 1.2 5.8 4.4" />
  </svg>
);

export const StatsIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 20V11M10 20V5M16 20v-7M21 20H3" />
  </svg>
);

export const CalendarIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 17.2h.01M12 17.2h.01" strokeWidth="2.6" />
  </svg>
);

export const ShareIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
  </svg>
);
