# Sweatr

Put in a parlay and follow every leg live: player stat progress, scores and hit/miss status.

**Stack:** Vite + React · Supabase (logins + saved parlays) · ESPN public feeds (live data, free) · Gemini (screenshot scanning, free tier) · Vercel (hosting + `/api` server function)

## Setup (all doable from a phone browser)

### 1. Supabase
1. Create a project at supabase.com.
2. Open **SQL Editor** → paste all of `supabase/schema.sql` → **Run**.
3. Go to **Project Settings → API** and copy the **Project URL** and **anon public key**.
4. Optional for testing: **Authentication → Providers → Email**, turn off "Confirm email" so you can sign in right away.

### 2. Live data
Nothing to set up. Scores and box scores come from ESPN's public site API (free, no key). It's unofficial, so if ESPN changes a path, fix it in `api/_espn.js`.

### 3. GitHub
Upload this folder to a new repo. Keep the structure exactly as it is: `api/`, `src/`, `supabase/`, `index.html` and `package.json` must sit at the **top level** of the repo, not inside a `sweatr/` folder.

### 4. Vercel
1. Import the repo. Vercel auto-detects Vite.
2. Add the environment variables from `.env.example`:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY` from aistudio.google.com (free tier) **or** `ANTHROPIC_API_KEY`, for screenshot scanning
3. Deploy.

## How it works

| File | Job |
|---|---|
| `api/sports.js` | Server function. Checks the user is signed in, then fetches scores, rosters and box scores from ESPN. |
| `api/_espn.js` | ESPN URLs per league + converts ESPN's data into one shape. **If a league errors, fix it here.** |
| `src/lib/stats.js` | Prop markets per league (Points, PRA, Passing Yards, Hits…). Add new props here. |
| `src/lib/evaluate.js` | Decides if each leg is pending / live / hit / miss / push. Overs lock in as soon as they clear, unders bust as soon as they go over. |
| `api/scan.js` | Sends a bet-slip screenshot to Gemini (free) or Claude and returns the legs as JSON. |
| `src/lib/scan.js` | Shrinks the screenshot, then matches each leg to a real game and player (handles nicknames and abbreviation differences). |
| `src/components/LegForm.jsx` | League → date → game → bet type → player/stat/line. |
| `src/components/ParlayView.jsx` | Live tracker. Polls every 30s until every game is final. |

## Known gaps / next up
- Players who are injured or inactive are hidden from the roster list.
