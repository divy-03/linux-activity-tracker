import { readFileSync } from 'fs';
import { logger } from '../utils/logger';

export interface MemoryInfo {
  total_mb: number;
  free_mb: number;
  available_mb: number;
  used_mb: number;
  percent: number;
  buffers_mb: number;
  cached_mb: number;
  swap_total_mb: number;
  swap_free_mb: number;
  swap_used_mb: number;
  swap_percent: number;
}

/**
 * Parse /proc/meminfo to get memory statistics
 */
export class ProcParser {
  /**
   * Read and parse /proc/meminfo
   */
  getMemoryInfo(): MemoryInfo {
    try {
      const meminfo = readFileSync('/proc/meminfo', 'utf-8');
      const lines = meminfo.split('\n');

      const data: Record<string, number> = {};

      // Parse each line: "MemTotal:       16384000 kB"
      for (const line of lines) {
        const match = line.match(/^(\w+):\s+(\d+)/);
        if (match) {
          const [, key, value] = match;
          data[key] = parseInt(value, 10); // Value in KB
        }
      }

      // Extract values (all in KB from /proc/meminfo)
      const memTotal = data.MemTotal || 0;
      const memFree = data.MemFree || 0;
      const memAvailable = data.MemAvailable || 0;
      const buffers = data.Buffers || 0;
      const cached = data.Cached || 0;
      const swapTotal = data.SwapTotal || 0;
      const swapFree = data.SwapFree || 0;

      // Convert KB to MB
      const toMB = (kb: number) => Math.round(kb / 1024 * 100) / 100;

      const totalMB = toMB(memTotal);
      const freeMB = toMB(memFree);
      const availableMB = toMB(memAvailable);
      const usedMB = totalMB - availableMB;

      // Calculate percentage based on MemAvailable (more accurate)
      const percent = totalMB > 0
        ? Math.round((usedMB / totalMB) * 10000) / 100
        : 0;

      const swapTotalMB = toMB(swapTotal);
      const swapFreeMB = toMB(swapFree);
      const swapUsedMB = swapTotalMB - swapFreeMB;
      const swapPercent = swapTotalMB > 0
        ? Math.round((swapUsedMB / swapTotalMB) * 10000) / 100
        : 0;

      return {
        total_mb: totalMB,
        free_mb: freeMB,
        available_mb: availableMB,
        used_mb: usedMB,
        percent: percent,
        buffers_mb: toMB(buffers),
        cached_mb: toMB(cached),
        swap_total_mb: swapTotalMB,
        swap_free_mb: swapFreeMB,
        swap_used_mb: swapUsedMB,
        swap_percent: swapPercent
      };
    } catch (error) {
      logger.error('Failed to read /proc/meminfo', error);
      throw error;
    }
  }

  /**
   * Get CPU load averages
   */
  getLoadAverage(): { load1: number; load5: number; load15: number } {
    try {
      const loadavg = readFileSync('/proc/loadavg', 'utf-8');
      const [load1, load5, load15] = loadavg.split(' ').map(parseFloat);

      return {
        load1: Math.round(load1 * 100) / 100,
        load5: Math.round(load5 * 100) / 100,
        load15: Math.round(load15 * 100) / 100
      };
    } catch (error) {
      logger.error('Failed to read /proc/loadavg', error);
      return { load1: 0, load5: 0, load15: 0 };
    }
  }

  /**
   * Get system uptime in seconds
   */
  getUptime(): number {
    try {
      const uptime = readFileSync('/proc/uptime', 'utf-8');
      const seconds = parseFloat(uptime.split(' ')[0]);
      return Math.round(seconds);
    } catch (error) {
      logger.error('Failed to read /proc/uptime', error);
      return 0;
    }
  }
}

export const procParser = new ProcParser();
