// Push notification copy. Each moment has a bunch of lines; one is picked at random.
// {player} {last} {line} {stat} {current} {need} {team} {win} {stake} {name} {hits} {total} {left} {game}

const COPY = {
  start: [
    ['Sweat mode: ON 💧', '{game} just started. Hydrate accordingly.'],
    ['It’s go time', '“{name}” is officially live. Deep breaths. In through the nose.'],
    ['Kickoff 🫡', 'Your legs are on the field. Your heart is in your throat. Normal stuff.'],
    ['The sweat has begun', '{game} is underway. Clear your schedule and your forehead.'],
    ['Lights on 💡', '{total} legs, one prayer. {game} is live.'],
  ],
  hit: [
    ['{last} said “say less” ✅', '{player} cleared {line} {stat}. {hits}/{total} legs in.'],
    ['Leg locked 🔒', '{player} is over {line} {stat}. That one’s in the bank.'],
    ['{last} understood the assignment', '{current} {stat} and counting. {hits}/{total} hit.'],
    ['Cash that leg ✅', '{player} went over {line} {stat}. Send him a fruit basket.'],
    ['One down, sort of ✅', '{player} hit. You may now unclench (slightly). {hits}/{total}.'],
    ['{last} ate', 'Over {line} {stat}: done. {left} to go.'],
  ],
  hitTeam: [
    ['{team} got it done ✅', '{leg} hit. {hits}/{total} legs in.'],
    ['Leg locked 🔒', '{leg} is a winner. {left} to go.'],
    ['Never doubted them (we doubted them) ✅', '{leg} cashed. {hits}/{total}.'],
  ],
  close: [
    ['{last} needs {need} more {stat} 😰', 'So close you can taste it. Don’t look. Okay, look.'],
    ['Inches away', '{player} is at {current}/{line} {stat}. Somebody get him the ball.'],
    ['Hold my hand', '{player} needs {need} more {stat}. This is fine. Everything is fine.'],
    ['Sweat level: monsoon 💦', '{player}: {current} {stat}. Line: {line}. Your blood pressure: yes.'],
  ],
  last: [
    ['ONE LEG LEFT 😳', 'Everything hit except {leg}. {win} on the line. Breathe.'],
    ['It all comes down to {lastOrTeam}', '{hits}/{total} hit. {leg} for {win}. No pressure.'],
    ['The final boss', '{leg} is the only thing between you and {win}.'],
    ['Last leg standing 🙏', 'One more and it’s {win}. Light a candle. Light two.'],
  ],
  miss: [
    ['{last} sold 🪦', 'Finished at {current} {stat}, needed {line}. “{name}” has entered the afterlife.'],
    ['We don’t talk about {last}', '{current} {stat}. The line was {line}. Moving on emotionally.'],
    ['Tough beat 💔', '{player} came up short on {line} {stat}. The slip is cooked.'],
    ['RIP “{name}”', '{player}: {current} {stat}. Gone but not forgotten. Mostly forgotten.'],
    ['{last} owes you a refund', '{current}/{line} {stat}. Screenshot this for the group chat.'],
  ],
  missTeam: [
    ['{team} fumbled the bag 🪦', '{leg} didn’t hit. “{name}” is officially cooked.'],
    ['Tough beat 💔', '{leg} missed. Pour one out for “{name}”.'],
    ['Never trusting {team} again', 'Until next week. {leg} missed.'],
  ],
  badBeat: [
    ['1 LEG AWAY 😭', '{player} finished at {current} {stat}. Needed {line}. That’s a bad beat. Share it, you earned it.'],
    ['Pain. Just pain.', '{hits}/{total} hit and {last} said no. {current}/{line} {stat}.'],
    ['Historians will study this beat', '{total}-leg parlay. One miss. {leg}. We’re so sorry.'],
  ],
  cashed: [
    ['CASHED 💰', '“{name}” hit. +{win}. Act natural.'],
    ['YOU HIT 🎉', 'All {total} legs. +{win}. Tell everyone. Then tell them again.'],
    ['The sweat is over 💧', 'And you are drenched in money. +{win}.'],
    ['Certified genius 🧠', '{total}/{total}. +{win}. Frame this one.'],
    ['Money printer: brrr 💸', '“{name}” cashed for +{win}. Share the receipt.'],
  ],
  test: [
    ['Sweatr alerts are on 💧', 'You’ll hear from us when legs hit, miss, or get scary close.'],
    ['Testing, testing 🎤', 'This is what a cash alert would feel like. Imagine it says +$500.'],
    ['We’re in 🔔', 'Alerts on. Your phone will now sweat with you.'],
  ],
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function fill(str, v) {
  return str.replace(/\{(\w+)\}/g, (_, k) => (v[k] == null || v[k] === '' ? '' : String(v[k]))).replace(/\s{2,}/g, ' ').trim();
}

export function makeAlert(kind, vars) {
  const set = COPY[kind] || COPY.test;
  const [title, body] = pick(set);
  return { title: fill(title, vars), body: fill(body, vars) };
}

export const ALERT_KINDS = Object.keys(COPY);
