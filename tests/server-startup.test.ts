import * as fs from "fs/promises";
import * as path from "path";
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import "./utils/test-logger"; // Auto-suppress verbose output during tests
import { createTodoServer } from "../src/index";
import { clearAllCaches } from "../src/database";

/**
 * Tests for server startup with automatic migrations in clean environment
 */
describe("Server Startup with Migrations", () => {
  let originalCwd: string;
  let originalXdgDataHome: string | undefined;
  let tempTestDir: string;

  beforeEach(async () => {
    // Store original environment
    originalCwd = process.cwd();
    originalXdgDataHome = process.env.XDG_DATA_HOME;

    // Create isolated test environment
    tempTestDir = await fs.mkdtemp("/tmp/mcp-todo-startup-test-");
    process.env.XDG_DATA_HOME = tempTestDir;
    
    // Copy the real drizzle migration files to the test directory
    const realDrizzleDir = path.join(originalCwd, "drizzle");
    const testDrizzleDir = path.join(tempTestDir, "drizzle");
    
    try {
      await fs.cp(realDrizzleDir, testDrizzleDir, { recursive: true });
    } catch {
      console.warn("Could not copy drizzle directory, tests may fail");
    }
    
    // Change working directory to test directory so migration paths work
    process.chdir(tempTestDir);
    
    // Clear any cached database connections
    clearAllCaches();
  });

  afterEach(async () => {
    // Restore original environment
    process.chdir(originalCwd);
    if (originalXdgDataHome !== undefined) {
      process.env.XDG_DATA_HOME = originalXdgDataHome;
    } else {
      delete process.env.XDG_DATA_HOME;
    }

    // Clear caches
    clearAllCaches();

    // Clean up test directory
    try {
      await fs.rm(tempTestDir, { recursive: true, force: true });
    } catch {
      console.warn("Failed to clean up test directory");
    }
  });

  test("should startup server and apply migrations automatically in clean environment", async () => {
    // Verify clean environment - no database should exist
    const dataDir = path.join(tempTestDir, "mcp-todo");
    const dbPath = path.join(dataDir, "todos.db");
    
    try {
      await fs.access(dbPath);
      throw new Error("Database file should not exist in clean environment");
    } catch {
      // Expected - database should not exist yet
    }
    
    // Initialize project context (this triggers database initialization)
    const { initializeProjectContext } = await import("../src/database");
    await initializeProjectContext();
    
    // Create the server
    const server = createTodoServer();
    
    // Verify server was created
    expect(server).toBeDefined();
    
    // Verify database file was created
    await fs.access(dbPath); // Should not throw
    
    // Check database contents using sqlite directly
    const { Database } = await import("bun:sqlite");
    const sqlite = new Database(dbPath);
    
    // Enable foreign keys for this connection
    sqlite.exec("PRAGMA foreign_keys = ON;");
    
    try {
      // Verify all expected tables exist
      const tables = sqlite.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name IN ('project', 'todo_list', 'todo', 'settings')
      `).all();
      
      expect(tables).toHaveLength(4);
      
      // Verify migration tracking table exists
      const migrationTables = sqlite.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name = '__drizzle_migrations'
      `).all();
      
      expect(migrationTables).toHaveLength(1);
      
      // Verify triggers exist
      const triggers = sqlite.query(`
        SELECT COUNT(*) as count FROM sqlite_master 
        WHERE type='trigger'
      `).get() as { count: number };
      
      expect(triggers.count).toBeGreaterThan(0);
      
      // Verify specific statistics triggers exist
      const statsTriggers = sqlite.query(`
        SELECT name FROM sqlite_master 
        WHERE type='trigger' AND name LIKE '%update_todo_list_stats%'
      `).all();
      
      expect(statsTriggers).toHaveLength(3);
      
      // Verify foreign keys are enabled
      const foreignKeys = sqlite.query("PRAGMA foreign_keys").get() as { foreign_keys: number };
      expect(foreignKeys.foreign_keys).toBe(1);
      
    } finally {
      sqlite.close();
    }
  });

  test("should initialize project context automatically", async () => {
    // Initialize project context first
    const { initializeProjectContext, getCurrentProject } = await import("../src/database");
    await initializeProjectContext();
    
    // Create the server
    const server = createTodoServer();
    expect(server).toBeDefined();
    
    // Should have automatically created a project for the current directory
    const currentProject = await getCurrentProject();
    expect(currentProject).toBeDefined();
    expect(currentProject?.name).toBeDefined();
    expect(currentProject?.location).toBe(tempTestDir);
    expect(currentProject?.default_todo_list_id).toBeDefined();
  });

  test("should handle multiple server startups gracefully", async () => {
    // Initialize project context first
    const { initializeProjectContext, getCurrentProject } = await import("../src/database");
    await initializeProjectContext();
    
    // First startup
    const server1 = createTodoServer();
    expect(server1).toBeDefined();
    
    // Get initial project state
    const project1 = await getCurrentProject();
    expect(project1).toBeDefined();
    
    // Second startup (should not create duplicate project)
    const server2 = createTodoServer();
    expect(server2).toBeDefined();
    
    // Should still have the same project
    const project2 = await getCurrentProject();
    expect(project2).toBeDefined();
    expect(project2).toBeDefined();
    expect(project1).toBeDefined();
    expect(project2!.id).toBe(project1!.id);
    expect(project2!.name).toBe(project1!.name);
  });

  test("should create functional MCP tools after startup", async () => {
    // Initialize project context first
    const { initializeProjectContext } = await import("../src/database");
    await initializeProjectContext();
    
    // Create the server
    const server = createTodoServer();
    expect(server).toBeDefined();
    
    // Test that we can call a tool handler directly
    const { handleTodoWrite } = await import("../src/index");
    const { getTodosByListId } = await import("../src/database");
    
    // Create a todo
    const writeResult = await handleTodoWrite({
      id: 1,
      content: "Test todo for startup test",
    });
    
    expect(writeResult.content).toBeDefined();
    expect(writeResult.content[0]!.text).toContain("saved successfully");
    
    // Verify todo was created by reading from database directly
    const todos = await getTodosByListId();
    expect(todos).toBeDefined();
    expect(todos).toHaveLength(1);
    expect(todos[0]!.content).toBe("Test todo for startup test");
  });
});