import { spawnSync } from 'child_process';
import { logger } from '../utils/logger';
import { getConfig } from '../utils/config';

export interface ProcessInfo {
  pid: number;
  user: string;
  memory_mb: number;
  memory_percent: number;
  cpu_percent: number;
  command: string;
  full_command: string;
  ppid: number;
  state: string;
  vsz_kb: number;
  rss_kb: number;
}

export class ProcessScanner {
  private currentUser: string;

  constructor() {
    this.currentUser = process.env.USER || 'unknown';
  }

  /**
   * Get all processes for current user sorted by memory usage
   */
  getUserProcesses(): ProcessInfo[] {
    try {
      // Use ps to get processes owned by current user
      // Format: PID USER %MEM %CPU VSZ RSS PPID STAT COMMAND
      const result = spawnSync('ps', [
        '-u', this.currentUser,
        '-o', 'pid,user,%mem,%cpu,vsz,rss,ppid,stat,comm,args',
        '--no-headers',
        '--sort', '-%mem'  // Sort by memory descending
      ], {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      if (result.error) {
        throw result.error;
      }

      if (result.status !== 0) {
        throw new Error(`ps command failed with status ${result.status}: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split('\n');
      const processes: ProcessInfo[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const parsed = this.parsePsLine(line);
          if (parsed) {
            processes.push(parsed);
          }
        } catch (error) {
          logger.debug(`Failed to parse ps line: ${line}`, error);
        }
      }

      logger.debug(`Found ${processes.length} processes for user ${this.currentUser}`);
      return processes;
    } catch (error) {
      logger.error('Failed to get user processes', error);
      return [];
    }
  }

  /**
   * Parse a single line from ps output
   */
  private parsePsLine(line: string): ProcessInfo | null {
    // Split by whitespace, but preserve the full command at the end
    const parts = line.trim().split(/\s+/);

    if (parts.length < 9) {
      return null;
    }

    const pid = parseInt(parts[0], 10);
    const user = parts[1];
    const memPercent = parseFloat(parts[2]);
    const cpuPercent = parseFloat(parts[3]);
    const vsz = parseInt(parts[4], 10); // KB
    const rss = parseInt(parts[5], 10); // KB
    const ppid = parseInt(parts[6], 10);
    const state = parts[7];
    const comm = parts[8];
    const fullCommand = parts.slice(9).join(' ') || comm;

    return {
      pid,
      user,
      memory_mb: Math.round(rss / 1024 * 100) / 100,
      memory_percent: Math.round(memPercent * 100) / 100,
      cpu_percent: Math.round(cpuPercent * 100) / 100,
      command: comm,
      full_command: fullCommand,
      ppid,
      state,
      vsz_kb: vsz,
      rss_kb: rss
    };
  }

  /**
   * Filter processes that are safe to kill
   */
  getKillableProcesses(): ProcessInfo[] {
    const allProcesses = this.getUserProcesses();
    const config = getConfig();
    const protectedList = config.processes.protected;
    const minMemoryMB = config.processes.minMemoryMB;

    return allProcesses.filter(proc => {
      // Filter 1: Must use minimum amount of memory
      if (proc.memory_mb < minMemoryMB) {
        logger.debug(`Skipping ${proc.command} (${proc.pid}): memory too low (${proc.memory_mb}MB)`);
        return false;
      }

      // Filter 2: Must not be in protected list
      if (this.isProtected(proc, protectedList)) {
        logger.debug(`Skipping ${proc.command} (${proc.pid}): protected process`);
        return false;
      }

      // Filter 3: Must not be current process or parent
      if (this.isCurrentProcess(proc)) {
        logger.debug(`Skipping ${proc.command} (${proc.pid}): current process`);
        return false;
      }

      // Filter 4: Must not be shell process
      if (this.isShellProcess(proc)) {
        logger.debug(`Skipping ${proc.command} (${proc.pid}): shell process`);
        return false;
      }

      // Filter 5: Must not be critical state (zombie, etc.)
      if (this.isCriticalState(proc)) {
        logger.debug(`Skipping ${proc.command} (${proc.pid}): critical state ${proc.state}`);
        return false;
      }

      return true;
    });
  }

  /**
   * Check if process is in protected list
   */
  private isProtected(proc: ProcessInfo, protectedList: string[]): boolean {
    const commandLower = proc.command.toLowerCase();
    const fullCommandLower = proc.full_command.toLowerCase();

    return protectedList.some(pro => {
      const protectedLower = pro.toLowerCase();
      return commandLower === protectedLower ||
        commandLower.includes(protectedLower) ||
        fullCommandLower.includes(protectedLower);
    });
  }

  /**
   * Check if process is current process or parent
   */
  private isCurrentProcess(proc: ProcessInfo): boolean {
    const currentPid = process.pid;
    const parentPid = process.ppid;

    return proc.pid === currentPid || proc.pid === parentPid;
  }

  /**
   * Check if process is a shell
   */
  private isShellProcess(proc: ProcessInfo): boolean {
    const shellPatterns = ['bash', 'zsh', 'fish', 'sh', 'dash', 'ksh', 'tcsh'];
    const commandLower = proc.command.toLowerCase();

    // Check if it's the current shell PID
    if (proc.ppid === process.ppid) {
      return true;
    }

    return shellPatterns.some(shell => commandLower === shell);
  }

  /**
   * Check if process is in critical state
   */
  private isCriticalState(proc: ProcessInfo): boolean {
    const state = proc.state.toUpperCase();

    // Z = zombie, T = stopped, X = dead
    return state.includes('Z') || state.includes('T') || state.includes('X');
  }

  /**
   * Get process by PID
   */
  getProcessByPid(pid: number): ProcessInfo | null {
    const processes = this.getUserProcesses();
    return processes.find(p => p.pid === pid) || null;
  }

  /**
   * Get top memory consumers
   */
  getTopMemoryConsumers(limit: number = 10): ProcessInfo[] {
    const killable = this.getKillableProcesses();
    return killable.slice(0, limit);
  }

  /**
   * Get process statistics
   */
  getStats() {
    const allProcesses = this.getUserProcesses();
    const killableProcesses = this.getKillableProcesses();

    const totalMemory = allProcesses.reduce((sum, p) => sum + p.memory_mb, 0);
    const killableMemory = killableProcesses.reduce((sum, p) => sum + p.memory_mb, 0);

    return {
      total_processes: allProcesses.length,
      killable_processes: killableProcesses.length,
      protected_processes: allProcesses.length - killableProcesses.length,
      total_memory_mb: Math.round(totalMemory * 100) / 100,
      killable_memory_mb: Math.round(killableMemory * 100) / 100,
      user: this.currentUser
    };
  }

  /**
   * Validate process exists and is owned by current user
   */
  validateProcess(pid: number): { valid: boolean; reason?: string; process?: ProcessInfo } {
    const proc = this.getProcessByPid(pid);

    if (!proc) {
      return {
        valid: false,
        reason: 'Process not found or not owned by current user'
      };
    }

    if (proc.user !== this.currentUser) {
      return {
        valid: false,
        reason: `Process owned by different user: ${proc.user}`
      };
    }

    const config = getConfig();
    if (this.isProtected(proc, config.processes.protected)) {
      return {
        valid: false,
        reason: 'Process is in protected list'
      };
    }

    if (this.isCurrentProcess(proc)) {
      return {
        valid: false,
        reason: 'Cannot kill current process or parent'
      };
    }

    return {
      valid: true,
      process: proc
    };
  }
}

export const processScanner = new ProcessScanner();
