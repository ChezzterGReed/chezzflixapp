-- One row per person per Plex server. `id` is a SHA-256 of (server id + the person's Plex user id): no names, no logins, no tokens.
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
