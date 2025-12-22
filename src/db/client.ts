import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { SCHEMA, Command, SystemStat, KilledProcess, Event } from './schema';
import { logger } from '../utils/logger';
import { getConfig } from '../utils/config';

class DatabaseClient {
  private db: Database | null = null;
  private dbPath: string;

  constructor() {
    const config = getConfig();
    this.dbPath = config.database.path;
  }

  /**
   * Initialize database connection and create tables
   */
  init(): void {
    try {
      // Create data directory if it doesn't exist
      const dbDir = dirname(this.dbPath);
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
        logger.info(`Created database directory: ${dbDir}`);
      }

      // Open database connection
      this.db = new Database(this.dbPath, { create: true });
      logger.info(`Database connected: ${this.dbPath}`);

      // Enable WAL mode for better concurrency
      this.db.run('PRAGMA journal_mode = WAL');
      this.db.run('PRAGMA synchronous = NORMAL');
      this.db.run('PRAGMA cache_size = -64000'); // 64MB cache

      // Create tables
      this.createTables();

      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database', error);
      throw error;
    }
  }

  /**
   * Create all tables from schema
   */
  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Execute all schema statements
      this.db.run(SCHEMA.commands);
      this.db.run(SCHEMA.system_stats);
      this.db.run(SCHEMA.killed_processes);
      this.db.run(SCHEMA.events);

      logger.info('All tables created successfully');
    } catch (error) {
      logger.error('Failed to create tables', error);
      throw error;
    }
  }

  /**
   * Get database instance
   */
  getDb(): Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  /**
   * Insert a command record
   */
  insertCommand(cmd: Command): number {
    const db = this.getDb();
    const stmt = db.prepare(`
      INSERT INTO commands (cmd, cwd, user, exit_code, duration_ms)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      cmd.cmd,
      cmd.cwd,
      cmd.user,
      cmd.exit_code ?? null,
      cmd.duration_ms ?? null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Insert system stats record
   */
  insertSystemStat(stat: SystemStat): number {
    const db = this.getDb();
    const stmt = db.prepare(`
      INSERT INTO system_stats (ram_total_mb, ram_used_mb, ram_available_mb, ram_percent, swap_total_mb, swap_used_mb)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      stat.ram_total_mb,
      stat.ram_used_mb,
      stat.ram_available_mb,
      stat.ram_percent,
      stat.swap_total_mb ?? null,
      stat.swap_used_mb ?? null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Insert killed process record
   */
  insertKilledProcess(proc: KilledProcess): number {
    const db = this.getDb();
    const stmt = db.prepare(`
      INSERT INTO killed_processes (pid, name, memory_mb, signal, reason, success)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      proc.pid,
      proc.name,
      proc.memory_mb,
      proc.signal,
      proc.reason,
      proc.success
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Insert event record
   */
  insertEvent(event: Event): number {
    const db = this.getDb();
    const stmt = db.prepare(`
      INSERT INTO events (type, severity, message, metadata)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      event.type,
      event.severity,
      event.message,
      event.metadata ?? null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get recent commands
   */
  getRecentCommands(limit: number = 50): Command[] {
    const db = this.getDb();
    const stmt = db.prepare(`
      SELECT * FROM commands
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as Command[];
  }

  /**
   * Get latest system stats
   */
  getLatestSystemStats(limit: number = 100): SystemStat[] {
    const db = this.getDb();
    const stmt = db.prepare(`
      SELECT * FROM system_stats
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as SystemStat[];
  }

  /**
   * Get all killed processes
   */
  getKilledProcesses(limit: number = 50): KilledProcess[] {
    const db = this.getDb();
    const stmt = db.prepare(`
      SELECT * FROM killed_processes
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as KilledProcess[];
  }

  /**
   * Get events by type
   */
  getEvents(type?: string, severity?: string, limit: number = 100): Event[] {
    const db = this.getDb();

    let query = 'SELECT * FROM events WHERE 1=1';
    const params: any[] = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (severity) {
      query += ' AND severity = ?';
      params.push(severity);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = db.prepare(query);
    return stmt.all(...params) as Event[];
  }

  /**
   * Clean old records (for maintenance)
   */
  cleanOldRecords(daysToKeep: number = 30): void {
    const db = this.getDb();
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    db.run('DELETE FROM commands WHERE created_at < ?', cutoffTime);
    db.run('DELETE FROM system_stats WHERE created_at < ?', cutoffTime);
    db.run('DELETE FROM events WHERE created_at < ?', cutoffTime);

    logger.info(`Cleaned records older than ${daysToKeep} days`);
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('Database connection closed');
    }
  }
}

// Singleton instance
export const dbClient = new DatabaseClient();
