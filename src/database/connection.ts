import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { getDatabasePath, ensureDataDirectoryExists } from "../utils/xdg.js";

/**
 * Database Connection Management
 * 
 * Handles SQLite database initialization, connection caching, and migration application
 */

// Global database connection - will be initialized on first use
let dbConnection: { db: ReturnType<typeof drizzle>; sqlite: Database } | null = null;

/**
 * Initialize the database connection using the migration system
 * 
 * @returns Database connection object with Drizzle ORM instance and SQLite instance
 */
export async function initializeDatabase() {
  await ensureDataDirectoryExists();

  const dbPath = getDatabasePath();
  console.log(`Initializing database at: ${dbPath}`);

  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite);

  // Enable foreign keys
  sqlite.exec("PRAGMA foreign_keys = ON;");

  // Apply migrations if needed
  try {
    await applyMigrationsIfNeeded(db, sqlite);
  } catch (error) {
    console.error("Error applying migrations:", error);
    // For now, continue with manual schema creation as fallback
    await createSchemaManually(sqlite);
  }

  return { db, sqlite };
}

/**
 * Apply database migrations if needed
 * 
 * @param db - Drizzle database instance
 * @param _sqlite - SQLite database instance (for future use)
 */
async function applyMigrationsIfNeeded(db: ReturnType<typeof drizzle>, _sqlite: Database) {
  const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
  
  // Check if migrations folder exists
  try {
    await import("fs/promises").then(fs => fs.access("./drizzle"));
    
    // Apply migrations using standard drizzle-kit
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations applied successfully");
    
  } catch (error) {
    console.log("Migrations folder not found or migration failed, falling back to manual schema creation");
    throw error;
  }
}

/**
 * Fallback manual schema creation (legacy approach)
 * 
 * @param sqlite - SQLite database instance
 */
async function createSchemaManually(sqlite: Database) {
  console.log("Creating schema manually as fallback");
  
  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS project (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      default_todo_list_id INTEGER REFERENCES todo_list(id),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS todo_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      num_completed INTEGER,
      total_count INTEGER,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS todo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      todo_list_id INTEGER NOT NULL REFERENCES todo_list(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'medium',
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Create indexes for performance
  sqlite.exec(`CREATE INDEX IF NOT EXISTS location_idx ON project(location);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_todo_status ON todo(status);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_todo_priority ON todo(priority);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_todo_list_project ON todo_list(project_id);`);
}

/**
 * Lazily initialize and cache a Drizzle database connection so that the same
 * connection is reused across helper calls within the same process. Tests
 * intentionally spin up isolated processes, therefore we do not attempt to
 * persist the reference across different Bun test workers.
 * 
 * @returns Drizzle database instance
 */
export async function getDb() {
  if (!dbConnection) {
    dbConnection = await initializeDatabase();
  }

  return dbConnection.db;
}

/**
 * Get the raw SQLite database instance
 * Used for direct SQL operations like transactions
 * 
 * @returns SQLite database instance
 */
export async function getSqlite() {
  if (!dbConnection) {
    dbConnection = await initializeDatabase();
  }

  return dbConnection.sqlite;
}

/**
 * Clears the cached database connection, forcing the next database operation to create a fresh connection
 * Useful for testing scenarios where you need to reset the database connection
 */
export function clearDatabaseConnectionCache(): void {
  if (dbConnection) {
    try {
      dbConnection.sqlite.close();
    } catch (error) {
      // Ignore errors when closing the connection, as it might already be closed
      console.warn("Warning: Error closing database connection during cache clear:", error);
    }
  }
  dbConnection = null;
}