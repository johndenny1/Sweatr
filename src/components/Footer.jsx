import { HELPLINE, MIN_AGE } from '../lib/legal.js';

export default function Footer() {
  return (
    <footer className="rg-footer">
      <p>
        {MIN_AGE}+ only. Sweatr tracks bets; it isn't a sportsbook. Gambling problem? Call or text{' '}
        <a href={`tel:${HELPLINE.tel}`}>{HELPLINE.label}</a>.
      </p>
      <p>
        <a href="#privacy">Privacy</a> · <a href="#terms">Terms</a>
      </p>
    </footer>
  );
}
