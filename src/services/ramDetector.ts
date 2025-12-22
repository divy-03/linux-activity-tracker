import { logger } from '../utils/logger';
import { dbClient } from '../db/client';
import { getConfig } from '../utils/config';
import { RAMSnapshot } from './ramMonitor';

export interface DetectionEvent {
  timestamp: number;
  ram_percent: number;
  threshold: number;
  consecutive_count: number;
  action_taken: boolean;
}

export class RAMDetector {
  private lastTriggerTime: number = 0;
  private consecutiveHighRAM: number = 0;
  private detectionHistory: DetectionEvent[] = [];
  private cooldownMultiplier: number = 1;
  private isInCooldown: boolean = false;

  /**
   * Check if RAM usage exceeds threshold
   * Returns true if action should be taken
   */
  checkThreshold(snapshot: RAMSnapshot): boolean {
    const config = getConfig();
    const threshold = config.ram.threshold;
    const baseCooldown = config.ram.cooldown;

    // Check if RAM exceeds threshold
    if (snapshot.percent > threshold) {
      this.consecutiveHighRAM++;

      logger.warn(
        `⚠️  RAM threshold exceeded: ${snapshot.percent}% > ${threshold}% ` +
        `(consecutive: ${this.consecutiveHighRAM})`
      );

      // Check if we're in cooldown period
      if (this.isInCooldown) {
        const timeSinceLast = Date.now() - this.lastTriggerTime;
        const currentCooldown = this.calculateCooldown(baseCooldown);
        const remainingCooldown = currentCooldown - timeSinceLast;

        if (remainingCooldown > 0) {
          logger.debug(
            `In cooldown period: ${Math.round(remainingCooldown / 1000)}s remaining`
          );

          this.logDetectionEvent(snapshot, threshold, false);
          return false;
        } else {
          // Cooldown expired, reset
          this.isInCooldown = false;
          logger.info('Cooldown period expired, ready for action');
        }
      }

      // Require multiple consecutive detections to avoid false positives
      const requiredConsecutive = this.getRequiredConsecutiveCount();

      if (this.consecutiveHighRAM >= requiredConsecutive) {
        logger.warn(
          `🚨 RAM pressure confirmed after ${this.consecutiveHighRAM} consecutive detections`
        );

        this.triggerAction(snapshot, threshold);
        return true;
      } else {
        logger.debug(
          `Need ${requiredConsecutive - this.consecutiveHighRAM} more consecutive ` +
          `detections before taking action`
        );

        this.logDetectionEvent(snapshot, threshold, false);
        return false;
      }
    } else {
      // RAM below threshold - reset counters and cooldown multiplier
      if (this.consecutiveHighRAM > 0) {
        logger.info(
          `✅ RAM back to normal: ${snapshot.percent}% (was high for ` +
          `${this.consecutiveHighRAM} cycles)`
        );

        this.consecutiveHighRAM = 0;

        // Gradually reduce cooldown multiplier when system recovers
        if (this.cooldownMultiplier > 1) {
          this.cooldownMultiplier = Math.max(1, this.cooldownMultiplier * 0.5);
          logger.debug(`Cooldown multiplier reduced to ${this.cooldownMultiplier}`);
        }
      }

      return false;
    }
  }

  /**
   * Trigger action when threshold is exceeded
   */
  private triggerAction(snapshot: RAMSnapshot, threshold: number): void {
    this.lastTriggerTime = Date.now();
    this.isInCooldown = true;

    // Increase cooldown multiplier with exponential backoff
    this.cooldownMultiplier = Math.min(8, this.cooldownMultiplier * 2);

    logger.warn(
      `🔥 Action triggered! Cooldown multiplier: ${this.cooldownMultiplier}x`
    );

    // Log detection event
    this.logDetectionEvent(snapshot, threshold, true);

    // Log to database
    dbClient.insertEvent({
      type: 'ram_action_triggered',
      severity: 'warning',
      message: `RAM cleanup action triggered at ${snapshot.percent}%`,
      metadata: JSON.stringify({
        ram_percent: snapshot.percent,
        threshold,
        used_mb: snapshot.used_mb,
        available_mb: snapshot.available_mb,
        consecutive_detections: this.consecutiveHighRAM,
        cooldown_multiplier: this.cooldownMultiplier,
        next_cooldown_ms: this.calculateCooldown(getConfig().ram.cooldown)
      })
    });

    // Reset consecutive counter
    this.consecutiveHighRAM = 0;
  }

  /**
   * Calculate cooldown with exponential backoff
   */
  private calculateCooldown(baseCooldown: number): number {
    // Formula: delay = baseCooldown * (2 ^ (multiplier - 1))
    // With jitter to avoid thundering herd
    const exponentialDelay = baseCooldown * Math.pow(2, this.cooldownMultiplier - 1);

    // Cap at 30 minutes maximum
    const cappedDelay = Math.min(exponentialDelay, 30 * 60 * 1000);

    // Add jitter (±10%)
    const jitter = cappedDelay * 0.1 * (Math.random() * 2 - 1);

    return Math.round(cappedDelay + jitter);
  }

  /**
   * Get required consecutive detections based on system state
   */
  private getRequiredConsecutiveCount(): number {
    const config = getConfig();
    const monitorInterval = config.ram.monitorInterval;

    // Require at least 3 consecutive detections (default ~15 seconds at 5s interval)
    // More if monitoring interval is very short
    if (monitorInterval < 3000) {
      return 5; // 5 detections for sub-3s intervals
    } else if (monitorInterval < 7000) {
      return 3; // 3 detections for 3-7s intervals
    } else {
      return 2; // 2 detections for longer intervals
    }
  }

  /**
   * Log detection event for analytics
   */
  private logDetectionEvent(
    snapshot: RAMSnapshot,
    threshold: number,
    actionTaken: boolean
  ): void {
    const event: DetectionEvent = {
      timestamp: Date.now(),
      ram_percent: snapshot.percent,
      threshold,
      consecutive_count: this.consecutiveHighRAM,
      action_taken: actionTaken
    };

    this.detectionHistory.push(event);

    // Keep only last 100 events in memory
    if (this.detectionHistory.length > 100) {
      this.detectionHistory.shift();
    }
  }

  /**
   * Get detection statistics
   */
  getStats() {
    const now = Date.now();
    const config = getConfig();

    // Count recent detections (last hour)
    const hourAgo = now - (60 * 60 * 1000);
    const recentDetections = this.detectionHistory.filter(e => e.timestamp > hourAgo);
    const actionsInLastHour = recentDetections.filter(e => e.action_taken).length;

    return {
      consecutiveHighRAM: this.consecutiveHighRAM,
      isInCooldown: this.isInCooldown,
      cooldownMultiplier: this.cooldownMultiplier,
      lastTriggerTime: this.lastTriggerTime,
      timeSinceLastTrigger: this.lastTriggerTime > 0 ? now - this.lastTriggerTime : null,
      nextCooldownMs: this.isInCooldown
        ? this.calculateCooldown(config.ram.cooldown)
        : null,
      detectionHistory: {
        total: this.detectionHistory.length,
        lastHour: recentDetections.length,
        actionsLastHour: actionsInLastHour
      }
    };
  }

  /**
   * Get recent detection history
   */
  getHistory(limit: number = 50): DetectionEvent[] {
    return this.detectionHistory.slice(-limit);
  }

  /**
   * Force reset cooldown (for testing or manual intervention)
   */
  resetCooldown(): void {
    logger.info('Cooldown manually reset');
    this.isInCooldown = false;
    this.cooldownMultiplier = 1;
    this.consecutiveHighRAM = 0;
  }

  /**
   * Check if action can be taken right now (for manual testing)
   */
  canTakeAction(): boolean {
    if (!this.isInCooldown) return true;

    const config = getConfig();
    const timeSinceLast = Date.now() - this.lastTriggerTime;
    const currentCooldown = this.calculateCooldown(config.ram.cooldown);

    return timeSinceLast >= currentCooldown;
  }
}

export const ramDetector = new RAMDetector();
