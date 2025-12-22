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

  try {
    const configFile = readFileSync('./config.json', 'utf-8');
    config = JSON.parse(configFile);
    return config;
  } catch (error) {
    console.error('❌ Failed to load config.json, using defaults');
    // Fallback config
    config = {
      server: { port: 3000, host: 'localhost' },
      ram: { threshold: 90, monitorInterval: 5000, cooldown: 120000, enableAutoKill: false },
      processes: { protected: ['systemd', 'dbus-daemon'], minMemoryMB: 100 },
      database: { path: './data/activity.db' },
      logging: { level: 'info', console: true }
    };
    return config;
  }
}

export function getConfig(): Config {
  return config || loadConfig();
}
