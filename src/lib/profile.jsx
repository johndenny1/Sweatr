export function displayName(user) {
  const meta = user?.user_metadata || {};
  return meta.username || (user?.email || 'bettor').split('@')[0];
}

export function initials(name) {
  return (
    String(name || '?')
      .replace(/[^A-Za-z0-9 ]/g, ' ')
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

export function Avatar({ user, size = 40 }) {
  const name = displayName(user);
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials(name)}
    </div>
  );
}
