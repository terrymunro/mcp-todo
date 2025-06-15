import * as fs from "fs/promises";
import * as path from "path";
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import "./utils/test-logger"; // Auto-suppress verbose output during tests

/**
 * Tests for the migration system to ensure we're using standard drizzle-kit properly
 */
describe("Migration System Tests", () => {
  let originalCwd: string;
  let originalXdgDataHome: string | undefined;
  let tempTestDir: string;

  beforeEach(async () => {
    // Store original environment
    originalCwd = process.cwd();
    originalXdgDataHome = process.env.XDG_DATA_HOME;

    // Create isolated test environment
    tempTestDir = await fs.mkdtemp("/tmp/mcp-todo-migration-test-");
    process.env.XDG_DATA_HOME = tempTestDir;
    
    // Copy the real drizzle migration files to the test directory
    const realDrizzleDir = path.join(originalCwd, "drizzle");
    const testDrizzleDir = path.join(tempTestDir, "drizzle");
    
    try {
      await fs.cp(realDrizzleDir, testDrizzleDir, { recursive: true });
    } catch {
      // If drizzle directory doesn't exist, create minimal structure
      await fs.mkdir(testDrizzleDir, { recursive: true });
      await fs.mkdir(path.join(testDrizzleDir, "meta"), { recursive: true });
    }
    
    // Change working directory to test directory so migration paths work
    process.chdir(tempTestDir);
  });

  afterEach(async () => {
    // Restore original environment
    process.chdir(originalCwd);
    if (originalXdgDataHome !== undefined) {
      process.env.XDG_DATA_HOME = originalXdgDataHome;
    } else {
      delete process.env.XDG_DATA_HOME;
    }

    // Clean up test directory
    try {
      await fs.rm(tempTestDir, { recursive: true, force: true });
    } catch {
      console.warn("Failed to clean up test directory");
    }
  });

  test("should initialize database with migration files applied", async () => {
    // Import and test the database initialization
    const { initializeDatabase } = await import("../src/database");
    
    // Initialize the database (this should trigger migration)
    const { sqlite } = await initializeDatabase();
    
    try {
      // Check that our main tables exist after migration
      const tables = sqlite.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name IN ('project', 'todo_list', 'todo', 'settings')
      `).all();
      
      // Should have all 4 main tables
      expect(tables.length).toBeGreaterThanOrEqual(4);
      
      // Check that our location index exists
      const indexes = sqlite.query(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name = 'location_idx'
      `).all();
      
      expect(indexes).toHaveLength(1);
      
    } finally {
      sqlite.close();
    }
  });

  test("should handle migration folder access correctly", async () => {
    // Test with non-existent migration folder
    await fs.rm(path.join(tempTestDir, "drizzle"), { recursive: true, force: true });

    const { initializeDatabase } = await import("../src/database");
    
    // This should fallback to manual schema creation when drizzle folder doesn't exist
    const { sqlite } = await initializeDatabase();
    
    try {
      // Should still create basic tables via fallback schema creation
      const tables = sqlite.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name IN ('project', 'todo_list', 'todo', 'settings')
      `).all();
      
      // Should have all 4 main tables even with fallback
      expect(tables.length).toBeGreaterThanOrEqual(4);
      
    } finally {
      sqlite.close();
    }
  });

  test("should create database connection with proper configuration", async () => {
    const { initializeDatabase, getDatabasePath, getDataDirectory } = await import("../src/database");
    
    // Test data directory resolution (should append /mcp-todo to XDG_DATA_HOME)
    const dataDir = getDataDirectory();
    expect(dataDir).toBe(path.join(tempTestDir, "mcp-todo"));
    
    // Test database path resolution
    const dbPath = getDatabasePath();
    expect(dbPath).toBe(path.join(tempTestDir, "mcp-todo", "todos.db"));
    
    // Initialize database
    const { sqlite } = await initializeDatabase();
    
    // Verify database connection is working
    expect(sqlite).toBeDefined();
    
    // Test that foreign keys are enabled
    const result = sqlite.query("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(result.foreign_keys).toBe(1);
    
    // Clean up
    sqlite.close();
  });

  test("should apply migration with triggers and constraints", async () => {
    const { initializeDatabase } = await import("../src/database");
    
    // Initialize database with our real migration
    const { sqlite } = await initializeDatabase();
    
    try {
      // Check that our tables exist after migration
      const tables = sqlite.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name IN ('project', 'todo_list', 'todo', 'settings')
      `).all();
      
      expect(tables).toHaveLength(4);
      
      // Check that triggers exist
      const triggers = sqlite.query(`
        SELECT name FROM sqlite_master 
        WHERE type='trigger' AND name LIKE '%update_todo_list_stats%'
      `).all();
      
      expect(triggers.length).toBeGreaterThan(0);
      
      // Test that indexes exist
      const indexes = sqlite.query(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name = 'location_idx'
      `).all();
      
      expect(indexes).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });

  test("should handle database initialization with existing data", async () => {
    const { initializeDatabase } = await import("../src/database");
    
    const dbPath = path.join(tempTestDir, "mcp-todo", "todos.db");
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    
    // First initialization
    const { sqlite: sqlite1 } = await initializeDatabase();
    
    // Create some data
    sqlite1.exec(`
      INSERT INTO project (name, location) VALUES ('Test Project', '${tempTestDir}');
    `);
    
    const initialProjects = sqlite1.query("SELECT COUNT(*) as count FROM project").get() as { count: number };
    expect(initialProjects.count).toBe(1);
    
    sqlite1.close();
    
    // Second initialization (should not lose data)
    const { sqlite: sqlite2 } = await initializeDatabase();
    
    const finalProjects = sqlite2.query("SELECT COUNT(*) as count FROM project").get() as { count: number };
    expect(finalProjects.count).toBe(1);
    
    sqlite2.close();
  });
});