import { readFileSync } from 'fs';

export interface Config {
  server: {
    port: number;
    host: string;
  };
  ram: {
    threshold: number;
    monitorInterval: number;
    cooldown: number;
    enableAutoKill: boolean;
  };
  processes: {
    protected: string[];
    minMemoryMB: number;
  };
  database: {
    path: string;
  };
  logging: {
    level: string;
    console: boolean;
  };
}

let config: Config;

export function loadConfig(): Config {
  if (config) return config;

  let base: Config;

  try {
    const raw = readFileSync('./config.json', 'utf-8');
    base = JSON.parse(raw);
  } catch {
    base = {
      server: { port: 3000, host: 'localhost' },
      ram: {
        threshold: 90,
        monitorInterval: 5000,
        cooldown: 120000,
        enableAutoKill: false
      },
      processes: { protected: [], minMemoryMB: 100 },
      database: { path: './data/activity.db' },
      logging: { level: 'info', console: true }
    };
  }

  // Env overrides
  const env = process.env;

  config = {
    ...base,
    server: {
      host: env.TRACKER_HOST || base.server.host,
      port: env.TRACKER_PORT ? Number(env.TRACKER_PORT) : base.server.port
    },
    ram: {
      threshold: env.RAM_THRESHOLD ? Number(env.RAM_THRESHOLD) : base.ram.threshold,
      monitorInterval: env.RAM_MONITOR_INTERVAL
        ? Number(env.RAM_MONITOR_INTERVAL)
        : base.ram.monitorInterval,
      cooldown: env.RAM_COOLDOWN ? Number(env.RAM_COOLDOWN) : base.ram.cooldown,
      enableAutoKill: env.RAM_ENABLE_AUTOKILL
        ? env.RAM_ENABLE_AUTOKILL === 'true'
        : base.ram.enableAutoKill
    },
    processes: {
      protected: env.PROTECTED_PROCESSES
        ? env.PROTECTED_PROCESSES.split(',').map(s => s.trim()).filter(Boolean)
        : base.processes.protected,
      minMemoryMB: env.MIN_PROCESS_MEMORY_MB
        ? Number(env.MIN_PROCESS_MEMORY_MB)
        : base.processes.minMemoryMB
    },
    database: {
      path: env.DB_PATH || base.database.path
    },
    logging: {
      level: env.LOG_LEVEL || base.logging.level,
      console: base.logging.console
    }
  };

  return config;
}

export function getConfig(): Config {
  return config || loadConfig();
}
