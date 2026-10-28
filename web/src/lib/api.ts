import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import type { GameState } from "../game/rules.ts";
import type { Action } from "../game/rules.ts";
import { ApiError, client } from "./supabase.ts";

export interface MatchRow { state: GameState; revision: number; updated_at: string | null }
export interface RoomInfo { room_id: string; code: string; player_index: number; match: MatchRow | null }
export interface Profile {
  id: string; display_name: string; photo_url: string | null; is_guest: boolean;
  games_played: number; wins: number; losses: number; ai_wins: number; online_wins: number;
}

const OFFLINE = "Can't reach the server. Check your connection.";

async function call<T>(name: string, options: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const region = import.meta.env.VITE_SUPABASE_FUNCTION_REGION as string | undefined;
  if (region && region !== "any") {
    const [path, query] = name.split("?", 2);
    const params = new URLSearchParams(query);
    // The SDK's routing parameter avoids adding an x-region header to existing CORS policies.
    params.set("forceFunctionRegion", region);
    name = `${path}?${params}`;
  }
  const { data, error } = await client().functions.invoke(name, { method: options.method ?? "POST", body: options.body as never });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      let message = `Request failed (${error.context.status})`;
      try { message = (await error.context.json())?.error ?? message; } catch { /* not JSON */ }
      throw new ApiError(message, error.context.status);
    }
    throw new ApiError(error instanceof FunctionsFetchError ? OFFLINE : error.message);
  }
  return data as T;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw new ApiError(error.message, Number(error.code) || undefined);
  return data as T;
}

export const createRoom = () => call<{ room_id: string; code: string }>("create-room");
export const joinRoom = (code: string) => call<{ room_id: string; player_index: number; status: string }>("join-room", { body: { code: code.trim().toUpperCase() } });
export const getRoom = (roomId: string) => call<RoomInfo>(`get-room?room_id=${encodeURIComponent(roomId)}`, { method: "GET" });
export const submitAction = (roomId: string, revision: number, action: Action | { type: "resign" }) =>
  call<{ ok: boolean; match: MatchRow }>("submit-action", { body: { room_id: roomId, revision, action } });
export const claimTimeout = (roomId: string) => call<{ ok: boolean; match: MatchRow }>("claim-timeout", { body: { room_id: roomId } });

/** Name and photo of the player on the other side of a room, or null until someone has joined. */
export const getOpponent = (roomId: string) =>
  rpc<{ display_name: string; photo_url: string | null } | null>("get_room_opponent", { p_room_id: roomId });

export async function getMyProfile(userId: string): Promise<Profile> {
  const { data, error } = await client().from("profiles").select("*").eq("id", userId).single();
  if (error) throw new ApiError(error.message);
  return data as Profile;
}

export async function renameProfile(userId: string, name: string): Promise<void> {
  const clean = name.trim();
  if (clean.length < 1 || clean.length > 30) throw new ApiError("Pick a name between 1 and 30 characters.");
  const { error } = await client().from("profiles").update({ display_name: clean }).eq("id", userId);
  if (error) throw new ApiError(error.message);
}

/** Best effort: add a finished game against the computer to the player's stats. Never throws (offline is fine). */
export async function recordAiGame(won: boolean): Promise<void> {
  try { await rpc("record_ai_game", { won }); } catch { /* ignore */ }
}

// ---- quick match, rematch, community ---------------------------------------------------------

export interface QuickMatchResult { room_id: string; player_index: number; status: "waiting" | "started"; code?: string }
export const quickMatch = () => rpc<QuickMatchResult>("quick_match");
export const cancelQuickMatch = async () => { try { await rpc("cancel_quick_match"); } catch { /* best effort */ } };
export const requestRematch = (roomId: string) => rpc<string>("request_rematch", { p_room_id: roomId });

/** The room the players moved to for a rematch, once someone has asked for one. */
export async function getRematchRoom(roomId: string): Promise<string | null> {
  const { data, error } = await client().from("matches").select("rematch_room_id").eq("room_id", roomId).maybeSingle();
  if (error) throw new ApiError(error.message);
  return (data?.rematch_room_id as string | null | undefined) ?? null;
}

export interface CommunityStats { online_count: number; total_users: number; games_played: number }
export interface LeaderboardEntry { id: string; display_name: string; photo_url: string | null; online_wins: number; games_played: number }
export const getCommunityStats = () => rpc<CommunityStats>("get_community_stats");
export const getLeaderboard = (limit = 10) => rpc<LeaderboardEntry[]>("get_leaderboard", { limit_n: limit });
/** "I'm here" for the online counter. Best effort. */
export const touchPresence = async () => { try { await rpc("touch_presence"); } catch { /* offline is fine */ } };
