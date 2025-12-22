import { Elysia } from 'elysia';
import { loadConfig, getConfig } from './utils/config';
import { logger } from './utils/logger';
import { dbClient } from './db/client';

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
    // Test database connection
    try {
      const stats = dbClient.getLatestSystemStats(1);
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'linux-activity-tracker',
        database: 'connected',
        recordCount: {
          systemStats: stats.length
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
      stats: '/stats',
      commands: '/commands',
      graphql: '/graphql (coming in Step 8)'
    }
  }))
  .get('/stats', () => {
    const recentStats = dbClient.getLatestSystemStats(10);
    return {
      stats: recentStats,
      count: recentStats.length
    };
  })
  .get('/commands', () => {
    const recentCommands = dbClient.getRecentCommands(20);
    return {
      commands: recentCommands,
      count: recentCommands.length
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
`);

