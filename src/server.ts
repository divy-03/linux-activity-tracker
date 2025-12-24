import dotenv from "dotenv";
dotenv.config();

import { Elysia } from 'elysia';
import { loadConfig, getConfig } from './utils/config';
import { logger } from './utils/logger';
import { dbClient } from './db/client';
import { commandLogger, CommandPayload } from './services/commandLogger';
import { ramMonitor } from './services/ramMonitor';
import { ramDetector } from './services/ramDetector';
import { processScanner } from './system/processScanner';
import { processManager } from './services/processManager';
import { timeStamp } from 'console';

// Load configuration
loadConfig();
const config = getConfig();
logger.setLevel(config.logging.level);

// Initialize database
try {
  dbClient.init();
  logger.info('✅ Database initialized');
} catch (error) {
  logger.error('❌ Failed to initialize database', error);
  process.exit(1);
}

// Start RAM monitoring
try {
  ramMonitor.start();
  logger.info('✅ RAM monitoring started');

  ramMonitor.onHighRAM((snapshot) => {
    logger.warn(`⚠️  High RAM callback: ${snapshot.percent}%`);
  });
} catch (error) {
  logger.error('❌ Failed to start RAM monitoring', error);
}

const app = new Elysia()
  .get('/health', () => {
    try {
      const cmdStats = commandLogger.getStats();
      const ramStatus = ramMonitor.getStatus();
      const lastSnapshot = ramMonitor.getLastSnapshot();
      const procStats = processScanner.getStats();
      const killStats = processManager.getKilledProcessStats();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'linux-activity-tracker',
        database: 'connected',
        ramMonitor: {
          running: ramStatus.isRunning,
          current: lastSnapshot ? {
            percent: lastSnapshot.percent,
            used_mb: lastSnapshot.used_mb
          } : null,
          detector: {
            inCooldown: ramStatus.detector.isInCooldown
          }
        },
        processes: procStats,
        killedProcesses: killStats,
        stats: {
          commandsTotal: cmdStats.total
        }
      };
    } catch (error) {
      return {
        status: 'degraded',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  })

  .get('/', () => ({
    message: 'Linux Activity Tracker API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      processes: '/processes',
      processesKillable: '/processes/killable',
      killDryRun: '/kill/dry-run',
      killByPid: 'POST /kill/:pid',
      killedHistory: '/killed/history',
      killedStats: '/killed/stats',
      graphql: '/graphql (coming in Step 8)'
    }
  }))

  .post('/api/command', async ({ body }) => {
    try {
      const payload = body as CommandPayload;
      if (!payload.cmd || !payload.cwd) {
        return { success: false, error: 'Missing required fields' };
      }
      const id = commandLogger.logCommand(payload);
      return id ? { success: true, id } : { success: false };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  })

  .get('/commands', () => {
    const commands = dbClient.getRecentCommands(50);
    return { commands, count: commands.length };
  })

  .get('/ram/current', () => ramMonitor.getLastSnapshot() || { error: 'No data' })
  .get('/ram/status', () => ramMonitor.getStatus())
  .get('/detector/stats', () => ramDetector.getStats())

  .get('/processes', () => {
    const processes = processScanner.getUserProcesses();
    return { processes, count: processes.length };
  })

  .get('/processes/killable', () => {
    const killable = processScanner.getKillableProcesses();
    return { processes: killable, count: killable.length };
  })

  .get('/processes/top', ({ query }) => {
    const limit = parseInt(query.limit as string) || 10;
    const top = processScanner.getTopMemoryConsumers(limit);
    return { processes: top, count: top.length };
  })

  // Kill endpoints
  .get('/kill/dry-run', ({ query }) => {
    const maxKills = parseInt(query.max as string) || 1;
    return processManager.getDryRun(maxKills);
  })

  .post('/kill/:pid', async ({ params, body }) => {
    const pid = parseInt(params.pid, 10);
    if (isNaN(pid)) {
      return { success: false, error: 'Invalid PID' };
    }

    const reason = (body as any)?.reason || 'Manual kill request';
    const result = await processManager.killProcessByPid(pid, reason);

    if (!result) {
      return { success: false, error: 'Cannot kill process' };
    }

    return { success: result.success, result };
  })

  .get('/killed/history', ({ query }) => {
    const limit = parseInt(query.limit as string) || 50;
    const history = dbClient.getKilledProcesses(limit);
    return { history, count: history.length };
  })

  .get('/killed/stats', () => processManager.getKilledProcessStats())

  .get('/events', ({ query }) => {
    const type = query.type as string;
    const limit = parseInt(query.limit as string) || 100;
    const events = dbClient.getEvents(type, undefined, limit);
    return { events, count: events.length };
  })

  .post('/webhooks/ram-spike', ({ body }) => {
    // This is called internally, but can also call it manually
    return {
      ok: true,
      received: body ?? null,
      timestamp: Date.now()
    };
  })

  // Daily summary endpoint for n8n to poll
  .get('/reports/daily-commands', () => {
    const db = dbClient.getDb();

    const since = Date.now() - 24 * 60 * 60 * 1000;

    const total = db.prepare('SELECT COUNT(*) as c FROM commands WHERE created_at > ?').get(since) as { c: number };

    const top = db
      .prepare(`
      SELECT 
        SUBSTR(cmd, 1, INSTR(cmd || ' ', ' ') - 1) as base_cmd,
        COUNT(*) as count
      FROM commands
      WHERE created_at > ?
      GROUP BY base_cmd
      ORDER BY count DESC
      LIMIT 10
    `)
      .all(since) as { base_cmd: string; count: number }[];

    return {
      generatedAt: new Date().toISOString(),
      window: 'last_24h',
      totalCommands: total.c,
      topCommands: top
    };
  })

  // Weekly system report for n8n polling
  .get('/reports/weekly-system', () => {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const since = Date.now() - sevenDays;
    const db = dbClient.getDb();

    const ramStats = db
      .prepare(`
      SELECT 
        AVG(ram_percent) as avg_percent,
        MAX(ram_percent) as max_percent,
        MIN(ram_percent) as min_percent
      FROM system_stats
      WHERE created_at > ?
    `)
      .get(since) as any;

    const kills = db
      .prepare(`
      SELECT 
        COUNT(*) as total_killed,
        SUM(memory_mb) as total_memory_freed
      FROM killed_processes
      WHERE created_at > ?
    `)
      .get(since) as any;

    return {
      generatedAt: new Date().toISOString(),
      window: 'last_7d',
      ram: {
        avg: Math.round((ramStats.avg_percent || 0) * 100) / 100,
        max: ramStats.max_percent || 0,
        min: ramStats.min_percent || 0
      },
      killed: {
        total: kills.total_killed || 0,
        memoryFreedMb: Math.round((kills.total_memory_freed || 0) * 100) / 100
      }
    };
  })

  // DB backup info endpoint – n8n can hit this then run a backup
  .get('/backup/info', () => {
    const config = getConfig();
    return {
      dbPath: config.database.path,
      timestamp: Date.now()
    };
  })

  .listen(config.server.port);

// Graceful shutdown
const shutdown = () => {
  logger.info('Shutting down gracefully...');
  ramMonitor.stop();
  dbClient.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`
🚀 Linux Activity Tracker is running!
📡 Server: http://${app.server?.hostname}:${app.server?.port}

⚠️  Auto-kill: ${config.ram.enableAutoKill ? 'ENABLED' : 'DISABLED'}
📊 RAM Threshold: ${config.ram.threshold}%

🔧 Endpoints:
   Health: /health
   Processes: /processes/killable
   Dry Run: /kill/dry-run
   Kill PID: POST /kill/:pid
   History: /killed/history
   Stats: /killed/stats
`);

