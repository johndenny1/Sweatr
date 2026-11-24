// Push notification copy. Each moment has a bunch of lines; one is picked at random.
// {player} {last} {line} {stat} {current} {need} {team} {win} {stake} {name} {hits} {total} {left} {game}

const COPY = {
  start: [
    ['{game} is live', '“{name}” is running. Here we go.'],
    ['We’re underway', '{game} just tipped. {total} legs to sweat.'],
    ['Game on', '{game} started. Nothing to do now but watch.'],
    ['It’s live', '“{name}” is out of your hands now.'],
    ['{game} has started', 'Your slip is officially in play.'],
    ['Here we go 💧', '{total} legs, {game} is live. Settle in.'],
    ['No take-backs now', '{game} is underway.'],
    ['Lock in', '“{name}” just went live.'],
  ],
  hit: [
    ['{last} came through ✅', 'Over {line} {stat}. {hits}/{total} in.'],
    ['That’s one', '{player} cleared {line} {stat}. {left} to go.'],
    ['{last} handled it', '{current} {stat}, needed {line}. {hits}/{total}.'],
    ['Leg in ✅', '{player} over {line} {stat}. {left} left.'],
    ['Never in doubt', '{player} is over {line} {stat}. (It was in doubt.) {hits}/{total}.'],
    ['{last} did the job', 'Over {line} {stat} is done. {left} to go.'],
    ['Easy money', '{player} already has {current} {stat}. That leg’s in.'],
    ['{hits}/{total} ✅', '{player} cleared {line} {stat}. Keep it going.'],
  ],
  hitTeam: [
    ['{team} came through ✅', '{leg} hit. {hits}/{total} in.'],
    ['That’s one', '{leg} is in. {left} to go.'],
    ['{team} did their part', '{leg} hit. {hits}/{total}.'],
    ['Leg in ✅', '{leg}. {left} left.'],
    ['Good call on {team}', '{leg} cashed. {hits}/{total}.'],
  ],
  close: [
    ['{last} needs {need} more', '{current}/{line} {stat}. Getting close.'],
    ['Almost there', '{player} is at {current} {stat}. Line is {line}.'],
    ['{need} {stat} away', '{player} is right on the edge. {current}/{line}.'],
    ['Get {last} the ball', '{need} more {stat} and that leg’s in.'],
    ['This one’s getting tight', '{player}: {current} {stat}, needs {line}.'],
    ['Don’t look now', '{last} is {need} {stat} short. {current}/{line}.'],
    ['{last} is knocking on the door', '{current}/{line} {stat}. One good drive.'],
  ],
  last: [
    ['One leg left', 'Everything hit except {leg}. {win} on the line.'],
    ['It’s on {lastOrTeam} now', '{hits}/{total} hit. {leg} for {win}.'],
    ['{hits}/{total}', 'Just {leg} left. That’s {win}.'],
    ['All on {lastOrTeam}', 'One leg between you and {win}.'],
    ['Last one 😬', '{leg} is all that’s left. {win} if it hits.'],
    ['Down to one', 'Every other leg cashed. {leg} for {win}.'],
    ['Final leg', 'Need {leg}. {win} waiting.'],
  ],
  miss: [
    ['{last} came up short', '{current} {stat}, needed {line}. “{name}” is done.'],
    ['That’s the slip', '{player} finished with {current} {stat}. Line was {line}.'],
    ['{last} let you down', '{current}/{line} {stat}. On to the next one.'],
    ['Slip’s dead', '{player} missed {line} {stat}. Finished at {current}.'],
    ['Not tonight', '{player}: {current} {stat}. Needed {line}.'],
    ['{last} missed', '{current}/{line} {stat}. “{name}” is over.'],
    ['Unlucky', '{player} ended at {current} {stat}. The line was {line}.'],
    ['Yeah, that one’s gone', '{last} finished at {current}/{line} {stat}.'],
  ],
  missTeam: [
    ['{team} didn’t come through', '{leg} missed. “{name}” is done.'],
    ['That’s the slip', '{leg} didn’t hit.'],
    ['{team} let you down', '{leg} missed. On to the next one.'],
    ['Slip’s dead', '{leg} missed.'],
    ['Not tonight', '{team} couldn’t get it done. {leg} missed.'],
  ],
  badBeat: [
    ['One leg away 😭', '{player} finished at {current} {stat}. Needed {line}.'],
    ['That one hurts', '{hits}/{total} hit. {last} ended at {current}/{line} {stat}.'],
    ['So close', '{total} legs, one miss. {leg}.'],
    ['Brutal', 'Everything hit but {leg}. That’s a bad beat.'],
    ['{hits}/{total}. Of course.', '{leg} was the only miss.'],
    ['You were right there', 'One leg short. {leg}. Post it, people need to see this.'],
  ],
  cashed: [
    ['CASHED 💰', '“{name}” hit. +{win}.'],
    ['You hit', 'All {total} legs. +{win}.'],
    ['{total}/{total} ✅', '“{name}” cashed for +{win}.'],
    ['Paid 💰', '+{win}. Every leg hit.'],
    ['That’s a winner', '“{name}” is in. +{win}.'],
    ['Called it', '{total} for {total}. +{win}. Go share the slip.'],
    ['Money', '“{name}” hit for +{win}.'],
    ['Clean sweep', 'All {total} legs cashed. +{win}.'],
  ],
  test: [
    ['Alerts are on 💧', 'You’ll get a ping when legs hit, miss, or get close.'],
    ['You’re set', 'Sweatr will let you know when something happens on your slips.'],
    ['Test alert', 'This is what they’ll look like. Hopefully mostly cash alerts.'],
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
