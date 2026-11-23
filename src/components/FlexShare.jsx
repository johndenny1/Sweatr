import { useState } from 'react';
import { ShareSheet } from './RecapSheet.jsx';
import { drawStatsCard } from '../lib/statsCard.js';
import { pnlEntries, cumulative } from '../lib/pnl.js';
import { ShareIcon } from './Icons.jsx';

// "Flex your stats" button + share sheet with the Sweat Report card.
export default function FlexShare({ user, record, parlays, statuses, compact = false }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {compact ? (
        <button className="flex-mini" onClick={() => setOpen(true)} aria-label="Share your stats">
          <ShareIcon width={16} height={16} />
          Flex
        </button>
      ) : (
        <button className="flex-btn" onClick={() => setOpen(true)}>
          <ShareIcon width={20} height={20} />
          Flex your stats
        </button>
      )}
      {open && (
        <ShareSheet
          build={() => drawStatsCard(user, record, cumulative(pnlEntries(parlays || [], statuses || {})))}
          kicker="Flex on the group chat"
          title="Sweat Report"
          fileName="sweatr-sweat-report.png"
          shareTitle="My Sweatr stats"
          loadingText="Crunching your numbers…"
          alt="Your Sweatr stats card"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
