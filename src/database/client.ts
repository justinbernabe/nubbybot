import { mkdirSync } from 'fs';
import { dirname } from 'path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { runMigrations } from './migrations.js';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(dirname(config.db.path), { recursive: true });
    db = new Database(config.db.path);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    logger.info(`SQLite database opened at ${config.db.path}`);
    runMigrations(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    logger.info('SQLite database closed.');
  }
}
