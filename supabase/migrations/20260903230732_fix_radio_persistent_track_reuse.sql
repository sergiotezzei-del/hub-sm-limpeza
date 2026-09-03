alter table public.radio_playlist_tracks
  drop constraint if exists radio_playlist_tracks_storage_path_key;

create index if not exists radio_playlist_tracks_storage_path_idx
  on public.radio_playlist_tracks(storage_path);
