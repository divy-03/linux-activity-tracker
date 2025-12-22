import { dbClient } from '../db/client';
import { logger } from '../utils/logger';

export interface CommandPayload {
  cmd: string;
  cwd: string;
  user?: string;
  exit_code?: number;
  duration_ms?: number;
  shell?: string;
  hostname?: string;
}

export class CommandLogger {
  /**
   * Log a command to the database
   */
  logCommand(payload: CommandPayload): number | null {
    try {
      // Validate required fields
      if (!payload.cmd || !payload.cwd) {
        logger.warn('Invalid command payload - missing cmd or cwd', payload);
        return null;
      }

      // Sanitize and prepare data
      const sanitized = this.sanitizeCommand(payload);

      // Insert into database
      const id = dbClient.insertCommand({
        cmd: sanitized.cmd,
        cwd: sanitized.cwd,
        user: sanitized.user || process.env.USER || 'unknown',
        exit_code: sanitized.exit_code,
        duration_ms: sanitized.duration_ms
      });

      logger.debug(`Command logged: ${sanitized.cmd.substring(0, 50)}...`, { id });

      // Log event for critical commands
      if (this.isCriticalCommand(sanitized.cmd)) {
        dbClient.insertEvent({
          type: 'command_critical',
          severity: 'warning',
          message: `Critical command executed: ${sanitized.cmd}`,
          metadata: JSON.stringify({ cwd: sanitized.cwd, user: sanitized.user })
        });
      }

      return id;
    } catch (error) {
      logger.error('Failed to log command', error);
      return null;
    }
  }

  /**
   * Sanitize command data
   */
  private sanitizeCommand(payload: CommandPayload): CommandPayload {
    return {
      ...payload,
      // Truncate very long commands
      cmd: payload.cmd.substring(0, 10000),
      // Normalize paths
      cwd: payload.cwd.replace(/\/$/, ''),
      // Ensure numeric types
      exit_code: payload.exit_code !== undefined ? Number(payload.exit_code) : undefined,
      duration_ms: payload.duration_ms !== undefined ? Number(payload.duration_ms) : undefined
    };
  }

  /**
   * Check if command is critical (sudo, rm -rf, etc.)
   */
  private isCriticalCommand(cmd: string): boolean {
    const criticalPatterns = [
      /^sudo\s+rm/,
      /rm\s+(-[rfRF]+|--recursive|--force)/,
      /^sudo\s+systemctl/,
      /^dd\s+if=/,
      /mkfs\./,
      /^sudo\s+chmod\s+777/,
      /^chmod\s+-R\s+777/,
      /> \/dev\/sd/
    ];

    return criticalPatterns.some(pattern => pattern.test(cmd.trim()));
  }

  /**
   * Get command statistics
   */
  getStats() {
    const db = dbClient.getDb();

    const totalCommands = db.prepare('SELECT COUNT(*) as count FROM commands').get() as { count: number };
    const todayCommands = db.prepare(
      'SELECT COUNT(*) as count FROM commands WHERE created_at > ?'
    ).get(Date.now() - 86400000) as { count: number };

    const topCommands = db.prepare(`
      SELECT 
        SUBSTR(cmd, 1, INSTR(cmd || ' ', ' ') - 1) as base_cmd,
        COUNT(*) as count
      FROM commands
      WHERE created_at > ?
      GROUP BY base_cmd
      ORDER BY count DESC
      LIMIT 10
    `).all(Date.now() - 604800000); // Last 7 days

    return {
      total: totalCommands.count,
      today: todayCommands.count,
      topCommands
    };
  }
}

export const commandLogger = new CommandLogger();

