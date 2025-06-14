import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { getDatabasePath, ensureDataDirectoryExists } from './database.js';

/**
 * Applies all pending migrations to the database
 * This function should be called during application startup
 */
export async function runMigrations(): Promise<void> {
  console.log('Applying database migrations...');
  
  await ensureDataDirectoryExists();
  
  const dbPath = getDatabasePath();
  const sqlite = new Database(dbPath);
  
  // Enable foreign keys before running migrations
  sqlite.exec("PRAGMA foreign_keys = ON;");
  
  const db = drizzle(sqlite);
  
  try {
    // Check if tables already exist
    const tablesExist = await checkIfTablesExist(sqlite);
    
    if (tablesExist) {
      console.log('Tables already exist, checking migration state...');
      // For existing databases, we'll handle this more gracefully
      await handleExistingDatabase(db, sqlite);
    } else {
      // Apply all pending migrations for fresh databases
      await migrate(db, { migrationsFolder: './drizzle' });
      console.log('Migrations applied successfully');
    }
    
    // Apply additional SQL that Drizzle doesn't handle automatically
    await applyAdditionalSQL(sqlite);
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    sqlite.close();
  }
}

/**
 * Check if core tables already exist in the database
 */
async function checkIfTablesExist(sqlite: Database): Promise<boolean> {
  try {
    const result = sqlite.query(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name IN ('project', 'todo_list', 'todo', 'settings')
    `).all();
    
    return result.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Handle databases that already have tables
 */
async function handleExistingDatabase(db: ReturnType<typeof drizzle>, sqlite: Database): Promise<void> {
  try {
    // Try to initialize the migration tracking table if it doesn't exist
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);
    
    // Check if any migrations have been recorded
    const migrations = sqlite.query('SELECT hash FROM __drizzle_migrations').all();
    
    if (migrations.length === 0) {
      console.log('Marking existing schema as migrated...');
      // Mark the initial migration as already applied
      sqlite.exec(`
        INSERT INTO __drizzle_migrations (hash) 
        VALUES ('0000_free_bloodscream')
      `);
    }
    
    console.log('Existing database state verified');
    
  } catch (error) {
    console.warn('Could not verify migration state, continuing...', error);
  }
}

/**
 * Applies additional SQL statements that aren't handled by Drizzle migrations
 * This includes triggers for maintaining statistics
 */
async function applyAdditionalSQL(sqlite: Database): Promise<void> {
  console.log('Applying additional SQL constraints and triggers...');
  
  // Create triggers for updating todo list statistics
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS update_todo_list_stats_on_insert
    AFTER INSERT ON todo
    BEGIN
      UPDATE todo_list SET 
        num_completed = (SELECT COUNT(*) FROM todo WHERE todo_list_id = NEW.todo_list_id AND status = 'completed'),
        total_count = (SELECT COUNT(*) FROM todo WHERE todo_list_id = NEW.todo_list_id)
      WHERE id = NEW.todo_list_id;
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS update_todo_list_stats_on_update
    AFTER UPDATE ON todo
    BEGIN
      UPDATE todo_list SET 
        num_completed = (SELECT COUNT(*) FROM todo WHERE todo_list_id = NEW.todo_list_id AND status = 'completed'),
        total_count = (SELECT COUNT(*) FROM todo WHERE todo_list_id = NEW.todo_list_id)
      WHERE id = NEW.todo_list_id;
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS update_todo_list_stats_on_delete
    AFTER DELETE ON todo
    BEGIN
      UPDATE todo_list SET 
        num_completed = (SELECT COUNT(*) FROM todo WHERE todo_list_id = OLD.todo_list_id AND status = 'completed'),
        total_count = (SELECT COUNT(*) FROM todo WHERE todo_list_id = OLD.todo_list_id)
      WHERE id = OLD.todo_list_id;
    END;
  `);
  
  console.log('Additional SQL applied successfully');
}

/**
 * Command-line interface for running migrations manually
 */
export async function main() {
  try {
    await runMigrations();
    console.log('Migration process completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration process failed:', error);
    process.exit(1);
  }
}

// Run migrations if this file is executed directly
if (import.meta.main) {
  main().catch(console.error);
}