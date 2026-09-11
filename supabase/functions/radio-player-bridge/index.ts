import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const body = await req.json() as Record<string, unknown>;
    const action = stringValue(body.action);
    const token = stringValue(body.token);
    if (!token) return json({ error: "TOKEN_REQUIRED" }, 401);

    if (action === "playlist_track") {
      const sessionId = stringValue(body.session_id);
      const trackId = stringValue(body.track_id);
      if (!sessionId || !trackId) return json({ error: "TRACK_ID_REQUIRED" }, 400);

      const { data: trackRows, error: trackError } = await supabase.rpc("radio_bridge_playlist_track", {
        p_token: token,
        p_session_id: sessionId,
        p_track_id: trackId,
      });
      if (trackError) return rpcError(trackError);

      const track = Array.isArray(trackRows) && trackRows.length
        ? trackRows[0] as { storage_path?: string; file_name?: string }
        : null;
      const storagePath = stringValue(track?.storage_path);
      if (!storagePath) return json({ error: "TRACK_NOT_FOUND" }, 404);

      const { data: blob, error: storageError } = await supabase.storage.from("radio-playlists").download(storagePath);
      if (storageError || !blob) return json({ error: storageError?.message || "TRACK_DOWNLOAD_FAILED" }, 500);

      return new Response(blob, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "X-Radio-File-Name": encodeURIComponent(stringValue(track?.file_name) || "track.mp3"),
        },
      });
    }

    if (action === "playlist_cleanup") {
      const id = stringValue(body.id);
      if (!id) return json({ error: "ID_REQUIRED" }, 400);

      const { data: authorized, error: authError } = await supabase.rpc("radio_bridge_authorized", { p_token: token });
      if (authError) return rpcError(authError);
      if (authorized !== true) return json({ error: "UNAUTHORIZED" }, 401);

      const { data: trackRows, error: trackError } = await supabase
        .from("radio_playlist_tracks")
        .select("storage_path,cleanup_after_play")
        .eq("session_id", id);
      if (trackError) return json({ error: trackError.message }, 500);

      const paths = Array.isArray(trackRows)
        ? trackRows
            .filter((row) => (row as { cleanup_after_play?: boolean }).cleanup_after_play !== false)
            .map((row) => stringValue((row as { storage_path?: string }).storage_path))
            .filter(Boolean)
        : [];

      if (paths.length) {
        const { error: removeError } = await supabase.storage.from("radio-playlists").remove(paths);
        if (removeError) return json({ error: removeError.message }, 500);
      }

      return json({ ok: true, removed: paths.length });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

function rpcError(error: { message?: string; code?: string }) {
  const unauthorized = error.code === "28000" || String(error.message ?? "").includes("RADIO_BRIDGE_UNAUTHORIZED");
  return json({ error: unauthorized ? "UNAUTHORIZED" : String(error.message ?? "RPC_ERROR") }, unauthorized ? 401 : 500);
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
