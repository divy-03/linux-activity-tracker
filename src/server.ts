import { Elysia } from 'elysia';
import { loadConfig, getConfig } from './utils/config';
import { logger } from './utils/logger';
import { dbClient } from './db/client';
import { commandLogger, CommandPayload } from './services/commandLogger';

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

const app = new Elysia()
  .get('/health', () => {
    try {
      const stats = dbClient.getLatestSystemStats(1);
      const cmdStats = commandLogger.getStats();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'linux-activity-tracker',
        database: 'connected',
        stats: {
          commandsTotal: cmdStats.total,
          commandsToday: cmdStats.today,
          systemStatsRecords: stats.length
        }
      };
    } catch (error) {
      return {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'linux-activity-tracker',
        database: 'error',
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
      stats: '/stats',
      graphql: '/graphql (coming in Step 8)'
    }
  }))

  // Command logging endpoint
  .post('/api/command', async ({ body, headers }) => {
    try {
      const payload = body as CommandPayload;

      // Validate payload
      if (!payload.cmd || !payload.cwd) {
        return {
          success: false,
          error: 'Missing required fields: cmd, cwd'
        };
      }

      // Log command
      const id = commandLogger.logCommand(payload);

      if (id) {
        return {
          success: true,
          id,
          timestamp: Date.now()
        };
      } else {
        return {
          success: false,
          error: 'Failed to log command'
        };
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
    return {
      commands: recentCommands,
      count: recentCommands.length
    };
  })

  .get('/commands/stats', () => {
    return commandLogger.getStats();
  })

  .get('/stats', () => {
    const recentStats = dbClient.getLatestSystemStats(10);
    return {
      stats: recentStats,
      count: recentStats.length
    };
  })

  .listen(config.server.port);

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  dbClient.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully...');
  dbClient.close();
  process.exit(0);
});

console.log(`
🚀 Linux Activity Tracker is running!
📡 Server: http://${app.server?.hostname}:${app.server?.port}
🏥 Health: http://${app.server?.hostname}:${app.server?.port}/health
📊 Stats: http://${app.server?.hostname}:${app.server?.port}/stats
📝 Commands: http://${app.server?.hostname}:${app.server?.port}/commands
📈 Command Stats: http://${app.server?.hostname}:${app.server?.port}/commands/stats

🔧 To install shell hook:
   cd shell-hooks && bash install.sh
`);
