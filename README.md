# Quoridor

Android Quoridor (Kotlin, Jetpack Compose, Hilt) with an online two-player mode backed by Supabase.
Every online move is validated server-side by an edge function; clients predict legal moves immediately and reconcile with the confirmed response or Realtime.

## Layout

| Path | What |
|------|------|
| `app/` | Android app (`domain/rules` + `domain/ai`, `data/` Supabase client, `ui/` Compose screens) |
| `supabase/migrations/` | Postgres schema + RLS |
| `supabase/functions/` | Edge functions: `create-room`, `join-room`, `get-room`, `submit-action`, `cleanup-rooms` |
| `supabase/functions/_shared/quoridor.ts` | Server-side rule engine (must stay in sync with `QuoridorRules.kt`) |

## Setup

1. Install Android Studio (JDK 17) and the Android SDK 34.
2. Create a Supabase project. In **Authentication → Providers**, enable **Anonymous sign-ins**.
3. `cp local.properties.template local.properties` and fill in `sdk.dir`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
4. Deploy the backend:
   ```sh
   supabase link --project-ref <ref>
   supabase db push
   supabase functions deploy
   ```
5. Run the app: `./gradlew installDebug` (or press Run in Android Studio).

Single-player (Easy / Medium / Hard computer opponent) runs fully on-device, but the app still expects the Supabase values in `local.properties` to build.

## Tests

```sh
./gradlew test                         # Kotlin rules + AI tests
deno test supabase/functions           # server rule engine tests
```

Both run in CI (`.github/workflows/ci.yml`).

## Game rules enforced by the server

- Every action is validated in `submit-action`; clients cannot write to `matches`.
- A player may **resign** at any time.
- Each online player has 2 minutes of thinking time for the entire game (`GAME_TIME_MS`). Only the active player’s clock runs. The server stores both balances in `state.remaining_ms`, debits elapsed time before each action, and rejects play after expiry by finishing the game. The waiting player can also use `claim-timeout` when the active player’s balance reaches zero.
- `cleanup-rooms` deletes rooms older than 24h. Set a secret and schedule it (e.g. hourly with pg_cron / a cron caller):
  ```sh
  supabase secrets set CLEANUP_SECRET=<random>
  curl -X POST https://<ref>.supabase.co/functions/v1/cleanup-rooms -H "x-cleanup-secret: <random>"
  ```

## Accounts (sign-in, profiles, stats)

Players sign in with **Google** or **Play as guest** (a Supabase anonymous user). A guest can later press
**Link Google account** on the profile screen to keep their stats. Each user gets a `public.profiles` row from a
database trigger; stats are written only by the server (`record_ai_game()` for games against the computer, and the
edge functions for online games).

### One-time setup

1. **Database:** `supabase db push` (applies `20241002000000_profiles.sql`).
2. **Google Cloud Console** → APIs & Services:
   1. *OAuth consent screen*: External, add your email as a test user while testing.
   2. *Credentials → Create credentials → OAuth client ID → Web application*.
   3. Add this *Authorized redirect URI*: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
   4. Copy the **Client ID** and **Client secret**.
3. **Supabase dashboard → Authentication → Sign In / Providers:**
   - **Google**: enable, paste the Client ID and secret.
   - **Anonymous sign-ins**: enabled (already needed for guests).
   - **Allow manual linking**: enabled (needed for *Link Google account*).
4. **Supabase dashboard → Authentication → URL Configuration → Redirect URLs:** add `quoridor://login-callback`.

No SHA-1 fingerprints or `google-services.json` are needed: Google sign-in runs in the browser and returns to the app
through the `quoridor://login-callback` link.

### Known limits

- `ai_wins` comes from the device (the computer game is played locally), so it can be inflated by a modified app.
  Treat it as a casual stat; online wins are recorded by the server.
- Signing out of a **guest** account loses its stats permanently (the guest has no password). The profile screen warns about this.

## Community stats (Phase 2)

- **Home screen:** "N online · X players joined" (counts up when it appears), refreshed every 30 s while visible.
- **Presence:** while the app is on screen it calls `touch_presence()` once a minute. Someone is *online* if seen in the last 2 minutes.
- **Counters:** `meta_stats` (one row, not readable by clients) holds `total_users` and `games_played`; clients read them only through `get_community_stats()`.
- **Leaderboard:** `get_leaderboard()` returns the top 10 by online wins (players without an online win are not listed).
- **Online results are recorded by the database**, exactly once, when a match first becomes `finished` (win, resignation or timeout): both players' games/wins/losses, the winner's `online_wins`, and the global counter. Only the edge functions can update `matches`, so a client cannot fake a result.

### Database tests

```sh
cd supabase/tests && npm ci && npm test
```

Runs every migration in an in-memory Postgres (PGlite) with Supabase-style default grants and checks counters, presence,
leaderboard ordering, once-only result recording and the access rules. CI runs it on every pull request.

## Release builds (APK)

Debug builds run from Android Studio. To build an installable, signed release APK:

1. Create a signing key **once** and keep it (and its passwords) safe and backed up. Apps signed with a different key
   cannot update an existing install. See `keystore.properties.template`. **Never commit the key or the properties file**
   (both are git-ignored).
2. Build:
   ```sh
   QUORIDOR_KEYSTORE_PROPERTIES=/path/to/keystore.properties ./gradlew assembleRelease
   # -> app/build/outputs/apk/release/app-release.apk
   ```
3. Check the signature: `apksigner verify --verbose --print-certs app-release.apk`.
4. Share it, e.g. as a GitHub Release asset. Testers allow "install unknown apps" for their browser or file manager once.

Without a keystore, `assembleRelease` produces an *unsigned* APK that Android will not install.

## Public pages

`docs/` contains the project homepage and the privacy policy (needed for Google sign-in in production). Publish them with
GitHub Pages: Settings → Pages → *Deploy from a branch* → `main` → `/docs`. Replace `CONTACT_EMAIL_HERE` in both HTML files first.

## Web version (`web/`)

Play in the browser: React + Vite + TypeScript, deployed on Vercel. It uses an exact copy of the server's rules
(`supabase/functions/_shared/quoridor.ts` -> `web/src/shared/quoridor.ts`; run `npm run sync-rules` after changing the
rules, a test fails if the copy is stale), so the browser and the backend can never disagree.

```sh
cd web
npm ci
npm run dev            # http://localhost:5173
npm test               # rules, computer opponent, geometry
npm run build          # type-checks, then builds to web/dist
node e2e/smoke.mjs http://127.0.0.1:4173 shots   # real-browser test against `npm run preview`
```

Status (everything below works in the browser):
- **Play the computer** (Easy / Medium / Hard), or **two players on one device** (optionally turning the board towards whoever is moving).
  Tap-to-move and drag-and-drop walls. No sign-in needed.
- **Accounts:** Google or guest sign-in (a guest can link Google later and keep their stats), profile with editable name and stats.
- **Play online:**
  - **Quick match** pairs you with another player who is searching. Searches expire after 3 minutes or when the searcher goes quiet,
    and cancelling removes your waiting room, so you are never paired with someone who left.
  - **Create room**: share the code or the link `/join/CODE` with a friend.
  - Real-time play; moves are validated by the server; the second player sees the board turned around so their own pawn is at the bottom.
  - Resign any time, claim a win when the opponent exhausts their total 2-minute game clock, resume an unfinished game after a reload.
  - **Rematch** with the same opponent, seats swapped (the player who moved second now moves first).
- **Leaderboard** (top 10 by online wins) and live **"N online · X players joined"** counters.
- **Install to home screen** (web app manifest and icons; iPhone: Share -> Add to Home Screen).

### Configuration

Copy `web/.env.example` to `web/.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the same public
values the Android app uses). Without them the build still works but online features are hidden. In production set the same
two variables in the host. Also add your site address (e.g. `https://your-site.vercel.app/**` and `http://localhost:5173/**`)
under **Supabase → Authentication → URL Configuration → Redirect URLs**, or Google sign-in will not return to the site.

### Browser tests

`node e2e/smoke.mjs <url> shots` plays the computer and a pass-and-play game in a real browser and checks the install files. `node e2e/online.mjs <url> shots` runs **two browsers
as two players against the real backend** (creates throw-away guests named "ZZ web … (delete me)"): moves, drag-and-drop walls on both boards, resign, **rematch**, stats, leaderboard, counters, **quick match** and cancelling a search. Run it deliberately.

### Online action and clock regression checks

The online browser regression uses two isolated browser sessions and a deterministic mock API/Realtime transport.
It runs the real React hook, game screen and rules with a delayed 1.5-second response, and checks immediate pawn/wall
rendering, duplicate-input suppression, confirmation races, rollback, lost responses, cumulative clocks and confirmed results.
It does not create accounts or modify a live Supabase project.

```sh
cd web
npm run dev -- --host 127.0.0.1 --port 5173
# In a second terminal (set CHROME to your Chrome/Chromium executable on Linux):
node e2e/online-regression.mjs http://127.0.0.1:5173
```

Deploy the clock migration with `supabase db push`, then deploy `submit-action` and `claim-timeout` before shipping the
updated web/Android clients: successful action responses now include the confirmed match, avoiding another fetch.
Rooms, quick matches and rematches all initialize independent 120,000 ms balances. Existing matches receive initial balances
at rollout; earlier thinking time cannot be reconstructed because per-move timestamps were not stored. The current turn
still runs from its existing `updated_at`. This change does not deploy or alter the live backend automatically.

### Deploying this fork

Import `swar16/quoridor` into Vercel with **Root Directory** set to `web` and the **Vite** preset.
Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production and Preview to the intended Supabase project.
Set `VITE_SUPABASE_FUNCTION_REGION` to the database region (`ap-south-1` for Mumbai). This keeps authentication and
database calls inside the database region instead of repeatedly crossing regions from the user's nearest function.
Omit the setting or use `any` to restore automatic routing. Regional routing uses the SDK's `forceFunctionRegion` query
parameter, preserving the deployed functions' existing CORS policies.
Add the deployed URL to Supabase Auth's allowed redirect URLs. The build settings in `web/vercel.json` install the
lockfile, run the web tests, type-check, and build. Git pushes to `main` deploy production; other branches create previews.
In Vercel's Deployment Checks, require the four CI jobs before releasing production builds.

Enable **Web Analytics** in the Vercel project to collect website visits. Analytics can be filtered by production/preview
and hostname. Accounts, Google identities, player counts and game stats live in Supabase; they are separate
from website visitor analytics. Moving to another Supabase project requires a data migration and Google OAuth setup.
Existing sessions do not transfer. Guests should link Google on the original site before switching to keep access
to that guest account after its profile and identity have been migrated.

For automatic backend deployment, connect `swar16/quoridor` under **Supabase → Project Settings → Integrations**,
set working directory to `.`, production branch to `main`, and enable **Deploy to production**.
Preview branching is optional. The integration applies migrations and deploys the functions declared in
`supabase/config.toml`; configure production Auth URLs and providers separately in the dashboard.

The **Deploy Supabase** GitHub Actions workflow is a manual alternative. It runs CI first, applies migrations,
then deploys functions. Configure repository secrets `SUPABASE_ACCESS_TOKEN` and
`SUPABASE_DB_PASSWORD`, and the repository variable `SUPABASE_PROJECT_REF`, before running it. Never put privileged keys
in `VITE_` variables. Deploy backend changes before releasing clients that depend on them.
