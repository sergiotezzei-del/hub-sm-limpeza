import { useCallback, useEffect, useMemo, useState } from "react";
import { authenticatedSupabaseFetch, SUPABASE_URL } from "../security/services/supabaseClient";
import { RadioNotebookPlayer } from "./RadioNotebookPlayer";
import { RadioStudioPanel, type StudioPlayerState } from "./RadioStudioPanel";

export function RadioStudioHost() {
  const [player, setPlayer] = useState<StudioPlayerState | null>(null);

  const loadPlayer = useCallback(async () => {
    try {
      const response = await authenticatedSupabaseFetch(
        `${SUPABASE_URL}/rest/v1/radio_player_state?select=id,device_name,title,artist,album,player_status,volume,mute,mode,current_ms,total_ms,updated_at,last_error&id=eq.main&limit=1`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) return;
      const rows = (await response.json()) as StudioPlayerState[];
      setPlayer(rows[0] ?? null);
    } catch {
      setPlayer(null);
    }
  }, []);

  useEffect(() => {
    void loadPlayer();
    const timer = window.setInterval(() => void loadPlayer(), 5000);
    return () => window.clearInterval(timer);
  }, [loadPlayer]);

  const playerOnline = useMemo(() => {
    if (!player?.updated_at) return false;
    return Date.now() - new Date(player.updated_at).getTime() < 12000;
  }, [player]);

  return (
    <>
      <RadioNotebookPlayer playerOnline={playerOnline} />
      <RadioStudioPanel player={player} playerOnline={playerOnline} />
    </>
  );
}
