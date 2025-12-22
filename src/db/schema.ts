export const SCHEMA = {
  commands: `
    CREATE TABLE IF NOT EXISTS commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cmd TEXT NOT NULL,
      cwd TEXT NOT NULL,
      user TEXT NOT NULL,
      exit_code INTEGER,
      duration_ms INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_commands_created_at ON commands(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commands_user ON commands(user);
  `,

  system_stats: `
    CREATE TABLE IF NOT EXISTS system_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ram_total_mb INTEGER NOT NULL,
      ram_used_mb INTEGER NOT NULL,
      ram_available_mb INTEGER NOT NULL,
      ram_percent REAL NOT NULL,
      swap_total_mb INTEGER,
      swap_used_mb INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_system_stats_created_at ON system_stats(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_system_stats_ram_percent ON system_stats(ram_percent);
  `,

  killed_processes: `
    CREATE TABLE IF NOT EXISTS killed_processes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pid INTEGER NOT NULL,
      name TEXT NOT NULL,
      memory_mb REAL NOT NULL,
      signal TEXT NOT NULL,
      reason TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_killed_processes_created_at ON killed_processes(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_killed_processes_pid ON killed_processes(pid);
  `,

  events: `
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'error')),
      message TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
  `
};

export interface Command {
  id?: number;
  cmd: string;
  cwd: string;
  user: string;
  exit_code?: number;
  duration_ms?: number;
  created_at?: number;
}

export interface SystemStat {
  id?: number;
  ram_total_mb: number;
  ram_used_mb: number;
  ram_available_mb: number;
  ram_percent: number;
  swap_total_mb?: number;
  swap_used_mb?: number;
  created_at?: number;
}

export interface KilledProcess {
  id?: number;
  pid: number;
  name: string;
  memory_mb: number;
  signal: string;
  reason: string;
  success: number;
  created_at?: number;
}

export interface Event {
  id?: number;
  type: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  metadata?: string;
  created_at?: number;
}
