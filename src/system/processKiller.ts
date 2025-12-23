import { spawnSync } from 'child_process';
import { logger } from '../utils/logger';
import { ProcessInfo } from './processScanner';

export interface KillResult {
  success: boolean;
  pid: number;
  signal: string;
  memory_freed_mb: number;
  error?: string;
  attempts: number;
}

export class ProcessKiller {
  private readonly SIGTERM_WAIT_MS = 5000; // Wait 5 seconds after SIGTERM
  private readonly SIGKILL_WAIT_MS = 2000; // Wait 2 seconds after SIGKILL

  /**
   * Kill a process with SIGTERM, escalate to SIGKILL if needed
   */
  async killProcess(proc: ProcessInfo, reason: string): Promise<KillResult> {
    logger.warn(`Attempting to kill process: ${proc.command} (PID ${proc.pid}) - ${reason}`);

    const result: KillResult = {
      success: false,
      pid: proc.pid,
      signal: 'NONE',
      memory_freed_mb: proc.memory_mb,
      attempts: 0
    };

    try {
      // Attempt 1: SIGTERM (graceful)
      const sigtermSuccess = await this.sendSignal(proc.pid, 'SIGTERM');
      result.attempts++;

      if (sigtermSuccess) {
        // Wait for process to exit
        const exited = await this.waitForProcessExit(proc.pid, this.SIGTERM_WAIT_MS);

        if (exited) {
          logger.info(`✅ Process ${proc.pid} (${proc.command}) terminated gracefully with SIGTERM`);
          result.success = true;
          result.signal = 'SIGTERM';
          return result;
        } else {
          logger.warn(`⏱️  Process ${proc.pid} did not respond to SIGTERM, escalating...`);
        }
      }

      // Attempt 2: SIGKILL (forceful)
      const sigkillSuccess = await this.sendSignal(proc.pid, 'SIGKILL');
      result.attempts++;

      if (sigkillSuccess) {
        // Wait for process to be killed
        const exited = await this.waitForProcessExit(proc.pid, this.SIGKILL_WAIT_MS);

        if (exited) {
          logger.info(`✅ Process ${proc.pid} (${proc.command}) killed with SIGKILL`);
          result.success = true;
          result.signal = 'SIGKILL';
          return result;
        } else {
          logger.error(`❌ Process ${proc.pid} did not exit after SIGKILL`);
          result.error = 'Process did not exit after SIGKILL';
          return result;
        }
      } else {
        result.error = 'Failed to send SIGKILL';
        return result;
      }
    } catch (error) {
      logger.error(`Error killing process ${proc.pid}`, error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
      return result;
    }
  }

  /**
   * Send a signal to a process
   */
  private async sendSignal(pid: number, signal: string): Promise<boolean> {
    try {
      // Use Node.js process.kill (works cross-platform)
      process.kill(pid, signal);
      logger.debug(`Sent ${signal} to PID ${pid}`);
      return true;
    } catch (error: any) {
      // ESRCH = No such process (already dead)
      if (error.code === 'ESRCH') {
        logger.debug(`Process ${pid} already exited`);
        return true;
      }

      // EPERM = Operation not permitted
      if (error.code === 'EPERM') {
        logger.error(`Permission denied to kill PID ${pid}`);
        return false;
      }

      logger.error(`Failed to send ${signal} to PID ${pid}`, error);
      return false;
    }
  }

  /**
   * Wait for a process to exit
   */
  private async waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (!this.processExists(pid)) {
        return true;
      }

      // Check every 100ms
      await Bun.sleep(100);
    }

    return false;
  }

  /**
   * Check if a process exists
   */
  private processExists(pid: number): boolean {
    try {
      // Sending signal 0 checks existence without killing
      process.kill(pid, 0);
      return true;
    } catch (error: any) {
      if (error.code === 'ESRCH') {
        return false; // Process doesn't exist
      }
      // If EPERM, process exists but we can't access it
      return true;
    }
  }

  /**
   * Kill multiple processes (one at a time)
   */
  async killProcesses(
    processes: ProcessInfo[],
    reason: string,
    maxKills: number = 1
  ): Promise<KillResult[]> {
    const results: KillResult[] = [];
    const toKill = processes.slice(0, maxKills);

    logger.info(`Killing ${toKill.length} process(es): ${reason}`);

    for (const proc of toKill) {
      const result = await this.killProcess(proc, reason);
      results.push(result);

      // Stop if we encounter an error
      if (!result.success) {
        logger.warn('Stopping kill sequence due to failure');
        break;
      }

      // Small delay between kills
      if (toKill.length > 1) {
        await Bun.sleep(500);
      }
    }

    return results;
  }

  /**
   * Safely kill highest memory process
   */
  async killHighestMemoryProcess(
    candidateProcesses: ProcessInfo[],
    reason: string
  ): Promise<KillResult | null> {
    if (candidateProcesses.length === 0) {
      logger.warn('No processes available to kill');
      return null;
    }

    // Get the highest memory consumer
    const target = candidateProcesses[0];

    logger.warn(
      `🎯 Target selected: ${target.command} (PID ${target.pid}) ` +
      `using ${target.memory_mb}MB (${target.memory_percent}%)`
    );

    return await this.killProcess(target, reason);
  }

  /**
   * Estimate memory that will be freed
   */
  estimateMemoryRecovery(processes: ProcessInfo[], count: number = 1): number {
    const toKill = processes.slice(0, count);
    return toKill.reduce((sum, p) => sum + p.memory_mb, 0);
  }

  /**
   * Dry run - simulate killing without actually doing it
   */
  dryRun(processes: ProcessInfo[], maxKills: number = 1): {
    targets: ProcessInfo[];
    estimated_memory_mb: number;
  } {
    const targets = processes.slice(0, maxKills);
    const estimated_memory_mb = this.estimateMemoryRecovery(processes, maxKills);

    return {
      targets,
      estimated_memory_mb
    };
  }
}

export const processKiller = new ProcessKiller();
