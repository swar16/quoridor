import { useState } from "react";
import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from "../game/ai.ts";
import type { CommunityStats } from "../lib/api.ts";
import { useCountUp } from "../lib/hooks.ts";
import { onlineConfigured } from "../lib/supabase.ts";

interface Props {
  onPlay: (d: Difficulty) => void;
  onPvP: () => void;
  onQuick: () => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onProfile: () => void;
  onLeaderboard: () => void;
  onHelp: () => void;
  onSignIn: () => void;
  signedIn: boolean;
  guest: boolean;
  resume: boolean;
  onResume: () => void;
  stats: CommunityStats | null;
  busy: boolean;
  error: string | null;
}

function Count({ value }: { value: number }) {
  return <strong>{useCountUp(value)}</strong>;
}

/** "● 12 online · 340 players joined". Hidden until the numbers have loaded. */
function CommunityBar({ stats }: { stats: CommunityStats }) {
  return (
    <p className="community" aria-label={`${stats.online_count} online, ${stats.total_users} players have joined`}>
      <span className="live" /> <Count value={stats.online_count} /> online · <Count value={stats.total_users} /> {stats.total_users === 1 ? "player" : "players"} joined
    </p>
  );
}

export function Home(p: Props) {
  const [code, setCode] = useState("");
  const valid = code.trim().length === 8;
  return (
    <div className="home">
      {onlineConfigured && (
        <div className="account">
          <button className="chip" onClick={p.onLeaderboard} aria-label="Leaderboard">🏆</button>
          {p.signedIn
            ? <button className="chip" onClick={p.onProfile}>👤 {p.guest ? "Guest · Profile" : "Profile"}</button>
            : <button className="chip" onClick={p.onSignIn}>Sign in</button>}
        </div>
      )}
      <div className="home-inner">
        <p className="dots"><span className="mine" /><span className="theirs" /></p>
        <h1>Quoridor</h1>
        <p className="muted">Race to the other side. Block your opponent with walls.</p>
        {p.stats && <CommunityBar stats={p.stats} />}
        <button className="linklike" onClick={p.onHelp}>❔ How to play</button>

        <h3>Play the computer</h3>
        <div className="levels">
          {DIFFICULTIES.map((d) => (
            <button key={d} className="level" onClick={() => p.onPlay(d)}>{DIFFICULTY_LABEL[d]}</button>
          ))}
        </div>
        <button className="secondary" onClick={p.onPvP}>Two players, one device</button>

        {onlineConfigured && (
          <>
            <hr />
            <h3>Play online</h3>
            {p.resume && <button className="primary" onClick={p.onResume}>Resume game</button>}
            <button className={p.resume ? "secondary" : "primary"} disabled={p.busy} onClick={p.onQuick}>Quick match</button>
            <button className="secondary" disabled={p.busy} onClick={p.onCreate}>Create room (invite a friend)</button>
            <form className="join" onSubmit={(e) => { e.preventDefault(); if (valid) p.onJoin(code); }}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                placeholder="Room code"
                aria-label="Room code"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" className="secondary" disabled={!valid || p.busy}>Join room</button>
            </form>
            {p.error && <p className="warn block">{p.error}</p>}
          </>
        )}

        <footer>
          <a href="/privacy">Privacy</a> · <a href="https://github.com/swar16/quoridor">Source</a>
        </footer>
      </div>
    </div>
  );
}
