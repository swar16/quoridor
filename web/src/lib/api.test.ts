import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./supabase.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("./supabase.ts")>();
  const { createClient } = await import("@supabase/supabase-js");
  const sdk = createClient("https://test.supabase.co", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: transport.fetch },
  });
  return { ...original, client: () => sdk };
});

import { claimTimeout, getRoom, submitAction } from "./api.ts";
import { ApiError } from "./supabase.ts";

describe("function transport", () => {
  beforeEach(() => {
    transport.fetch.mockReset();
    transport.fetch.mockImplementation(async () => new Response(JSON.stringify({ ok: true, match: {} }), {
      headers: { "Content-Type": "application/json" },
    }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("routes a room read to the database region without losing query parameters or requiring new CORS headers", async () => {
    vi.stubEnv("VITE_SUPABASE_FUNCTION_REGION", "ap-northeast-1");
    await getRoom("room/with space");
    const [url, request] = transport.fetch.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/functions/v1/get-room");
    expect(parsed.searchParams.get("room_id")).toBe("room/with space");
    expect(parsed.searchParams.get("forceFunctionRegion")).toBe("ap-northeast-1");
    expect(request.method).toBe("GET");
    expect(new Headers(request.headers).has("x-region")).toBe(false);
  });

  it("keeps action bodies and timeout requests intact when region routing is enabled", async () => {
    vi.stubEnv("VITE_SUPABASE_FUNCTION_REGION", "ap-northeast-1");
    const action = { type: "move" as const, row: 7, col: 4 };
    await submitAction("room", 3, action);
    await claimTimeout("room");
    for (const [url, request] of transport.fetch.mock.calls) {
      expect(new URL(url).searchParams.get("forceFunctionRegion")).toBe("ap-northeast-1");
      expect(request.method).toBe("POST");
      expect(new Headers(request.headers).has("x-region")).toBe(false);
    }
    expect(JSON.parse(transport.fetch.mock.calls[0][1].body)).toEqual({ room_id: "room", revision: 3, action });
    expect(JSON.parse(transport.fetch.mock.calls[1][1].body)).toEqual({ room_id: "room" });
  });

  it.each([undefined, "any"])("retains automatic routing when region is %s", async (region) => {
    vi.stubEnv("VITE_SUPABASE_FUNCTION_REGION", region);
    await getRoom("room");
    expect(new URL(transport.fetch.mock.calls[0][0]).searchParams.has("forceFunctionRegion")).toBe(false);
  });

  it("preserves stale-revision errors from the server", async () => {
    vi.stubEnv("VITE_SUPABASE_FUNCTION_REGION", "ap-northeast-1");
    transport.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Stale revision — fetch latest state" }), {
      status: 409, headers: { "Content-Type": "application/json" },
    }));
    const result = await submitAction("room", 1, { type: "move", row: 7, col: 4 }).catch(error => error);
    expect(result).toBeInstanceOf(ApiError);
    expect(result.isStale).toBe(true);
  });
});
