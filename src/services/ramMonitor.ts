import { procParser, MemoryInfo } from '../system/procParser';
import { dbClient } from '../db/client';
import { logger } from '../utils/logger';
import { getConfig } from '../utils/config';
import { ramDetector } from './ramDetector';
import { processManager } from './processManager';

export interface RAMSnapshot extends MemoryInfo {
  timestamp: number;
  uptime: number;
  load_avg: {
    load1: number;
    load5: number;
    load15: number;
  };
}

export class RAMMonitor {
  private intervalId: Timer | null = null;
  private isRunning: boolean = false;
  private lastSnapshot: RAMSnapshot | null = null;
  private monitoringStartTime: number = Date.now();
  private onHighRAMCallback: ((snapshot: RAMSnapshot) => void) | null = null;

  start(): void {
    if (this.isRunning) {
      logger.warn('RAM monitor is already running');
      return;
    }

    const config = getConfig();
    const interval = config.ram.monitorInterval;

    logger.info(`Starting RAM monitor (interval: ${interval}ms, threshold: ${config.ram.threshold}%)`);

    this.captureSnapshot();

    this.intervalId = setInterval(() => {
      this.captureSnapshot();
    }, interval);

    this.isRunning = true;
    this.monitoringStartTime = Date.now();

    dbClient.insertEvent({
      type: 'ram_monitor',
      severity: 'info',
      message: 'RAM monitoring started',
      metadata: JSON.stringify({ interval, threshold: config.ram.threshold })
    });
  }

  stop(): void {
    if (!this.isRunning) {
      logger.warn('RAM monitor is not running');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;

    const uptime = Date.now() - this.monitoringStartTime;
    logger.info(`RAM monitor stopped (uptime: ${Math.round(uptime / 1000)}s)`);

    dbClient.insertEvent({
      type: 'ram_monitor',
      severity: 'info',
      message: 'RAM monitoring stopped',
      metadata: JSON.stringify({ uptime })
    });
  }

  onHighRAM(callback: (snapshot: RAMSnapshot) => void): void {
    this.onHighRAMCallback = callback;
  }

  private captureSnapshot(): void {
    try {
      const memInfo = procParser.getMemoryInfo();
      const loadAvg = procParser.getLoadAverage();
      const uptime = procParser.getUptime();

      const snapshot: RAMSnapshot = {
        ...memInfo,
        timestamp: Date.now(),
        uptime,
        load_avg: loadAvg
      };

      dbClient.insertSystemStat({
        ram_total_mb: snapshot.total_mb,
        ram_used_mb: snapshot.used_mb,
        ram_available_mb: snapshot.available_mb,
        ram_percent: snapshot.percent,
        swap_total_mb: snapshot.swap_total_mb,
        swap_used_mb: snapshot.swap_used_mb
      });

      this.lastSnapshot = snapshot;

      logger.debug(
        `RAM: ${snapshot.percent}% (${snapshot.used_mb}/${snapshot.total_mb}MB) ` +
        `Load: ${snapshot.load_avg.load1}`
      );

      const shouldTakeAction = ramDetector.checkThreshold(snapshot);

      if (shouldTakeAction) {
        logger.warn('🚨 HIGH RAM DETECTED - Triggering process manager');

        // Trigger auto-kill
        this.handleHighRAMDetection(snapshot);

        // Trigger callback if set
        if (this.onHighRAMCallback) {
          this.onHighRAMCallback(snapshot);
        }
      }
    } catch (error) {
      logger.error('Failed to capture RAM snapshot', error);

      dbClient.insertEvent({
        type: 'ram_monitor',
        severity: 'error',
        message: 'Failed to capture RAM snapshot',
        metadata: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' })
      });
    }
  }

  private async handleHighRAMDetection(snapshot: RAMSnapshot): Promise<void> {
    try {
      const results = await processManager.handleHighRAM(snapshot.percent);
      const freedMemory = results.reduce(
        (sum, r) => sum + (r.success ? r.memory_freed_mb : 0),
        0
      );

      // Notify n8n via webhook if configured
      const webhookUrl = process.env.N8N_RAM_SPIKE_WEBHOOK || "http://n8n:5678/webhook-test/ram-spike";
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'ram_spike',
            ramPercent: snapshot.percent,
            freedMemoryMb: Math.round(freedMemory),
            timestamp: new Date(snapshot.timestamp).toISOString()
          })
        }).catch(() => { });
      }
    } catch (error) {
      logger.error('Error handling high RAM', error);
    }
  }
  getLastSnapshot(): RAMSnapshot | null {
    return this.lastSnapshot;
  }

  getStatus() {
    const detectorStats = ramDetector.getStats();

    return {
      isRunning: this.isRunning,
      uptime: this.isRunning ? Date.now() - this.monitoringStartTime : 0,
      lastSnapshot: this.lastSnapshot,
      detector: detectorStats,
      config: {
        interval: getConfig().ram.monitorInterval,
        threshold: getConfig().ram.threshold,
        cooldown: getConfig().ram.cooldown,
        autoKillEnabled: getConfig().ram.enableAutoKill
      }
    };
  }

  getStats(minutes: number = 60) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    const db = dbClient.getDb();

    const stats = db.prepare(`
      SELECT 
        AVG(ram_percent) as avg_percent,
        MAX(ram_percent) as max_percent,
        MIN(ram_percent) as min_percent,
        AVG(ram_used_mb) as avg_used_mb,
        COUNT(*) as sample_count
      FROM system_stats
      WHERE created_at > ?
    `).get(cutoff) as any;

    return {
      period_minutes: minutes,
      average_percent: Math.round(stats.avg_percent * 100) / 100,
      max_percent: Math.round(stats.max_percent * 100) / 100,
      min_percent: Math.round(stats.min_percent * 100) / 100,
      average_used_mb: Math.round(stats.avg_used_mb * 100) / 100,
      sample_count: stats.sample_count
    };
  }

  getHistory(limit: number = 100): RAMSnapshot[] {
    const stats = dbClient.getLatestSystemStats(limit);

    return stats.map(stat => ({
      total_mb: stat.ram_total_mb,
      free_mb: stat.ram_total_mb - stat.ram_used_mb,
      available_mb: stat.ram_available_mb,
      used_mb: stat.ram_used_mb,
      percent: stat.ram_percent,
      buffers_mb: 0,
      cached_mb: 0,
      swap_total_mb: stat.swap_total_mb || 0,
      swap_free_mb: (stat.swap_total_mb || 0) - (stat.swap_used_mb || 0),
      swap_used_mb: stat.swap_used_mb || 0,
      swap_percent: stat.swap_total_mb
        ? Math.round(((stat.swap_used_mb || 0) / stat.swap_total_mb) * 10000) / 100
        : 0,
      timestamp: stat.created_at || 0,
      uptime: 0,
      load_avg: { load1: 0, load5: 0, load15: 0 }
    }));
  }
}

export const ramMonitor = new RAMMonitor();

