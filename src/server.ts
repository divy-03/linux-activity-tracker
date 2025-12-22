import { Elysia } from 'elysia';
import { loadConfig, getConfig } from './utils/config';
import { logger } from './utils/logger';
import { dbClient } from './db/client';
import { commandLogger, CommandPayload } from './services/commandLogger';
import { ramMonitor } from './services/ramMonitor';
import { ramDetector } from './services/ramDetector';

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

  // Register high RAM callback (will be used in Step 7)
  ramMonitor.onHighRAM((snapshot) => {
    logger.warn(`⚠️  High RAM callback triggered: ${snapshot.percent}%`);

    if (config.ram.enableAutoKill) {
      logger.info('TODO: Trigger process killer (Step 7)');
      // processManager.killHighestMemoryProcess();
    } else {
      logger.info('Auto-kill disabled in config');
    }
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

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'linux-activity-tracker',
        database: 'connected',
        ramMonitor: {
          running: ramStatus.isRunning,
          uptime: ramStatus.uptime,
          current: lastSnapshot ? {
            percent: lastSnapshot.percent,
            used_mb: lastSnapshot.used_mb,
            available_mb: lastSnapshot.available_mb
          } : null,
          detector: {
            inCooldown: ramStatus.detector.isInCooldown,
            cooldownMultiplier: ramStatus.detector.cooldownMultiplier
          }
        },
        stats: {
          commandsTotal: cmdStats.total,
          commandsToday: cmdStats.today
        }
      };
    } catch (error) {
      return {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  })

  .get('/', () => ({
    message: 'Linux Activity Tracker API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      commandLog: 'POST /api/command',
      commands: '/commands',
      commandStats: '/commands/stats',
      ramCurrent: '/ram/current',
      ramHistory: '/ram/history',
      ramStats: '/ram/stats',
      ramStatus: '/ram/status',
      detectorStats: '/detector/stats',
      detectorHistory: '/detector/history',
      detectorReset: 'POST /detector/reset',
      events: '/events',
      graphql: '/graphql (coming in Step 8)'
    }
  }))

  // Command logging endpoint
  .post('/api/command', async ({ body }) => {
    try {
      const payload = body as CommandPayload;

      if (!payload.cmd || !payload.cwd) {
        return { success: false, error: 'Missing required fields: cmd, cwd' };
      }

      const id = commandLogger.logCommand(payload);

      if (id) {
        return { success: true, id, timestamp: Date.now() };
      } else {
        return { success: false, error: 'Failed to log command' };
      }
    } catch (error) {
      logger.error('Error in /api/command', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  })

  .get('/commands', () => {
    const recentCommands = dbClient.getRecentCommands(50);
    return { commands: recentCommands, count: recentCommands.length };
  })

  .get('/commands/stats', () => commandLogger.getStats())

  // RAM endpoints
  .get('/ram/current', () => {
    const snapshot = ramMonitor.getLastSnapshot();
    if (!snapshot) {
      return { error: 'No data available yet' };
    }
    return snapshot;
  })

  .get('/ram/history', ({ query }) => {
    const limit = parseInt(query.limit as string) || 100;
    const history = ramMonitor.getHistory(limit);
    return { history, count: history.length };
  })

  .get('/ram/stats', ({ query }) => {
    const minutes = parseInt(query.minutes as string) || 60;
    return ramMonitor.getStats(minutes);
  })

  .get('/ram/status', () => ramMonitor.getStatus())

  // Detector endpoints
  .get('/detector/stats', () => ramDetector.getStats())

  .get('/detector/history', ({ query }) => {
    const limit = parseInt(query.limit as string) || 50;
    const history = ramDetector.getHistory(limit);
    return { history, count: history.length };
  })

  .post('/detector/reset', () => {
    ramDetector.resetCooldown();
    return {
      success: true,
      message: 'Cooldown reset successfully',
      timestamp: Date.now()
    };
  })

  // Events endpoint
  .get('/events', ({ query }) => {
    const type = query.type as string;
    const severity = query.severity as string;
    const limit = parseInt(query.limit as string) || 100;

    const events = dbClient.getEvents(type, severity, limit);
    return { events, count: events.length };
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
🏥 Health: http://${app.server?.hostname}:${app.server?.port}/health

📊 RAM Monitoring:
   Current: http://${app.server?.hostname}:${app.server?.port}/ram/current
   History: http://${app.server?.hostname}:${app.server?.port}/ram/history
   Stats: http://${app.server?.hostname}:${app.server?.port}/ram/stats
   Status: http://${app.server?.hostname}:${app.server?.port}/ram/status

🔍 Detector:
   Stats: http://${app.server?.hostname}:${app.server?.port}/detector/stats
   History: http://${app.server?.hostname}:${app.server?.port}/detector/history
   Reset: POST http://${app.server?.hostname}:${app.server?.port}/detector/reset

📝 Commands:
   List: http://${app.server?.hostname}:${app.server?.port}/commands
   Stats: http://${app.server?.hostname}:${app.server?.port}/commands/stats

📋 Events: http://${app.server?.hostname}:${app.server?.port}/events

🔧 To install shell hook: cd shell-hooks && bash install.sh
`);

