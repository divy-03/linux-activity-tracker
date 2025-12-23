import { processScanner } from '../system/processScanner';
import { processKiller, KillResult } from '../system/processKiller';
import { dbClient } from '../db/client';
import { logger } from '../utils/logger';
import { getConfig } from '../utils/config';

export class ProcessManager {
  /**
   * Handle high RAM situation by killing processes
   */
  async handleHighRAM(ramPercent: number): Promise<KillResult[]> {
    const config = getConfig();

    if (!config.ram.enableAutoKill) {
      logger.warn('Auto-kill is disabled in config');
      return [];
    }

    logger.warn(`🔥 Handling high RAM situation: ${ramPercent}%`);

    // Get killable processes
    const killable = processScanner.getKillableProcesses();

    if (killable.length === 0) {
      logger.warn('No killable processes found');

      dbClient.insertEvent({
        type: 'ram_recovery_failed',
        severity: 'error',
        message: 'No killable processes available',
        metadata: JSON.stringify({ ram_percent: ramPercent })
      });

      return [];
    }

    logger.info(`Found ${killable.length} killable processes`);

    // Kill the top memory consumer
    const result = await processKiller.killHighestMemoryProcess(
      killable,
      `High RAM usage: ${ramPercent}%`
    );

    if (!result) {
      return [];
    }

    // Log to database
    dbClient.insertKilledProcess({
      pid: result.pid,
      name: killable[0].command,
      memory_mb: result.memory_freed_mb,
      signal: result.signal,
      reason: `High RAM usage: ${ramPercent}%`,
      success: result.success ? 1 : 0
    });

    // Log event
    dbClient.insertEvent({
      type: 'process_killed',
      severity: result.success ? 'warning' : 'error',
      message: result.success
        ? `Killed process ${result.pid} to free ${result.memory_freed_mb}MB`
        : `Failed to kill process ${result.pid}`,
      metadata: JSON.stringify({
        pid: result.pid,
        command: killable[0].command,
        memory_mb: result.memory_freed_mb,
        signal: result.signal,
        attempts: result.attempts,
        error: result.error
      })
    });

    return [result];
  }

  /**
   * Kill a specific process by PID
   */
  async killProcessByPid(pid: number, reason: string): Promise<KillResult | null> {
    // Validate process
    const validation = processScanner.validateProcess(pid);

    if (!validation.valid) {
      logger.error(`Cannot kill PID ${pid}: ${validation.reason}`);
      return null;
    }

    const proc = validation.process!;
    const result = await processKiller.killProcess(proc, reason);

    // Log to database
    dbClient.insertKilledProcess({
      pid: result.pid,
      name: proc.command,
      memory_mb: result.memory_freed_mb,
      signal: result.signal,
      reason: reason,
      success: result.success ? 1 : 0
    });

    return result;
  }

  /**
   * Get dry-run preview of what would be killed
   */
  getDryRun(maxKills: number = 1) {
    const killable = processScanner.getKillableProcesses();
    return processKiller.dryRun(killable, maxKills);
  }

  /**
   * Get statistics about killed processes
   */
  getKilledProcessStats() {
    const db = dbClient.getDb();

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_killed,
        SUM(memory_mb) as total_memory_freed,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_kills,
        SUM(CASE WHEN signal = 'SIGTERM' THEN 1 ELSE 0 END) as sigterm_kills,
        SUM(CASE WHEN signal = 'SIGKILL' THEN 1 ELSE 0 END) as sigkill_kills
      FROM killed_processes
      WHERE created_at > ?
    `).get(Date.now() - (7 * 24 * 60 * 60 * 1000)) as any; // Last 7 days

    return {
      total_killed: stats.total_killed || 0,
      total_memory_freed_mb: Math.round((stats.total_memory_freed || 0) * 100) / 100,
      successful_kills: stats.successful_kills || 0,
      failed_kills: (stats.total_killed || 0) - (stats.successful_kills || 0),
      sigterm_kills: stats.sigterm_kills || 0,
      sigkill_kills: stats.sigkill_kills || 0
    };
  }
}

export const processManager = new ProcessManager();
