import { CONTACT_EMAIL, GOVERNING_STATE, EFFECTIVE_DATE, MIN_AGE, HELPLINE } from '../lib/legal.js';

function Section({ title, children }) {
  return (
    <section className="legal-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Privacy() {
  return (
    <>
      <h2>Privacy Policy</h2>
      <p className="muted small">Effective {EFFECTIVE_DATE}</p>
      <p>
        Sweatr is a bet-tracking app. This policy explains what we collect, why, and the choices you have.
      </p>
      <Section title="What we collect">
        <ul>
          <li><b>Account info:</b> your email address and password. Passwords are handled by our login provider and stored hashed; we never see them.</li>
          <li><b>Profile:</b> the username and profile photo you choose.</li>
          <li><b>Slips you save:</b> the legs, stake, odds, results and verification status of each slip.</li>
          <li><b>Bet slip screenshots you scan:</b> sent to be read once. Sweatr does not keep the image; we keep only a one-way fingerprint of it so the same screenshot can't be used twice.</li>
          <li><b>Basic technical data:</b> standard server logs (like time of request and errors) that our hosting providers record.</li>
        </ul>
      </Section>
      <Section title="How we use it">
        <ul>
          <li>To run your account and show your slips, stats and profile.</li>
          <li>To read bet slips, match them to real games, grade them and verify them.</li>
          <li>To keep the service secure and prevent fake or duplicate slips.</li>
        </ul>
        <p>We do not sell your personal information and we do not show ads.</p>
      </Section>
      <Section title="Who we share it with">
        <ul>
          <li><b>Supabase</b> stores your account, slips and profile photo.</li>
          <li><b>Vercel</b> hosts the app and its servers.</li>
          <li>
            <b>Google (Gemini)</b> reads the screenshots you scan. On Google's free tier, Google may use what's sent to it to improve its products,
            and human reviewers may see it. Don't scan images with information you wouldn't want shared.
          </li>
          <li><b>ESPN</b>'s public data feeds supply scores and stats. Those requests don't include your personal information.</li>
        </ul>
        <p>We may also share information if required by law or to protect Sweatr and its users.</p>
      </Section>
      <Section title="Public information">
        <p>Profile photos are stored at a public web address so they can be displayed. Anyone with that address could view the photo.</p>
      </Section>
      <Section title="Keeping and deleting your data">
        <p>
          We keep your data while your account is open. You can delete your account any time from <b>Profile → Delete account</b>,
          which permanently removes your account, slips and profile photo. You can also email us to request a copy or deletion of your data.
        </p>
      </Section>
      <Section title="Age and location">
        <p>Sweatr is only for people {MIN_AGE} and older in the United States. We don't knowingly collect information from anyone under {MIN_AGE}; if we learn we have, we delete it.</p>
      </Section>
      <Section title="Security">
        <p>We use access rules so only you can see and change your own data, and encrypted connections between your device and our servers. No system is perfectly secure.</p>
      </Section>
      <Section title="Changes">
        <p>If we change this policy, we'll update the date above. Using Sweatr after a change means you accept the updated policy.</p>
      </Section>
      <Section title="Contact">
        <p>Questions or requests: {CONTACT_EMAIL}</p>
      </Section>
    </>
  );
}

function Terms() {
  return (
    <>
      <h2>Terms of Service</h2>
      <p className="muted small">Effective {EFFECTIVE_DATE}</p>
      <p>By creating an account or using Sweatr, you agree to these terms.</p>
      <Section title="Who can use Sweatr">
        <p>You must be at least {MIN_AGE} years old and in the United States. You're responsible for following the gambling laws where you live, including any higher legal betting age.</p>
      </Section>
      <Section title="What Sweatr is (and isn't)">
        <p>
          Sweatr is a tracker. It is <b>not a sportsbook</b>: it doesn't accept bets, hold money, pay winnings, or offer betting, financial or legal advice.
          Your sportsbook's records and rules always decide how your bets are settled.
        </p>
      </Section>
      <Section title="Data accuracy">
        <p>
          Scores, stats, play-by-play and grading come from third-party sources and automated tools, including reading screenshots.
          They can be delayed, incomplete or wrong. Don't rely on Sweatr to make betting decisions.
        </p>
      </Section>
      <Section title="Verified slips">
        <p>
          A "Verified" badge means a slip passed Sweatr's automated checks (scanned before kickoff, unchanged, not reused). It isn't a guarantee that a bet was placed or settled as shown.
        </p>
      </Section>
      <Section title="Your content and conduct">
        <ul>
          <li>Only upload your own bet slips and photos you have the right to use.</li>
          <li>Don't upload edited or fake slips, try to get around verification, or interfere with the app or other users.</li>
          <li>You keep ownership of what you upload and give Sweatr permission to store, process and display it to run the service.</li>
        </ul>
      </Section>
      <Section title="Names and logos">
        <p>
          Sweatr and its logo belong to Sweatr. Team, league and sportsbook names and logos belong to their owners and are shown only to identify games and bets.
          Sweatr isn't affiliated with or endorsed by any team, league, sportsbook or ESPN.
        </p>
      </Section>
      <Section title="Ending your account">
        <p>You can delete your account any time in Profile. We may suspend or close accounts that break these terms.</p>
      </Section>
      <Section title="Disclaimers and limits">
        <p>
          Sweatr is provided "as is," without warranties of any kind. To the fullest extent the law allows, Sweatr isn't liable for any losses, including betting losses,
          or for indirect or consequential damages arising from your use of the app.
        </p>
      </Section>
      <Section title="Play responsibly">
        <p>
          If gambling stops being fun, take a break. Gambling problem? Call or text the National Problem Gambling Helpline at{' '}
          <a href={`tel:${HELPLINE.tel}`}>{HELPLINE.label}</a>, available 24/7.
        </p>
      </Section>
      <Section title="Changes and law">
        <p>
          We may update these terms; we'll change the date above when we do. These terms are governed by the laws of {GOVERNING_STATE}, USA.
          Questions: {CONTACT_EMAIL}
        </p>
      </Section>
    </>
  );
}

export default function Legal({ page, onBack }) {
  return (
    <div className="legal">
      <button className="back-btn" onClick={onBack}>
        <svg className="back-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        <span>Back</span>
      </button>
      {page === 'terms' ? <Terms /> : <Privacy />}
    </div>
  );
}
