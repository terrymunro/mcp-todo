import * as fs from "fs/promises";
import * as path from "path";
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import "./utils/test-logger"; // Auto-suppress verbose output during tests
import { initializeDatabase } from "../src/database";

/**
 * Tests to verify that all database triggers are working correctly
 */
describe("Trigger Functionality Tests", () => {
  let originalCwd: string;
  let originalXdgDataHome: string | undefined;
  let tempTestDir: string;

  beforeEach(async () => {
    // Store original environment
    originalCwd = process.cwd();
    originalXdgDataHome = process.env.XDG_DATA_HOME;

    // Create isolated test environment
    tempTestDir = await fs.mkdtemp("/tmp/mcp-todo-trigger-test-");
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

  test("should update project timestamp when project is modified", async () => {
    const { sqlite } = await initializeDatabase();
    
    try {
      // Insert a project
      sqlite.exec(`
        INSERT INTO project (name, location) 
        VALUES ('Test Project', '${tempTestDir}')
      `);
      
      // Get the initial timestamp
      const initial = sqlite.query("SELECT updated_at FROM project WHERE id = 1").get() as { updated_at: number };
      expect(initial).toBeDefined();
      const initialTimestamp = initial.updated_at;
      
      // Wait a full second to ensure timestamp difference (SQLite unixepoch() has 1-second precision)
      await new Promise<void>(resolve => globalThis.setTimeout(resolve, 1100));
      
      // Update the project
      sqlite.exec(`
        UPDATE project SET name = 'Updated Project' WHERE id = 1
      `);
      
      // Check that timestamp was updated
      const updated = sqlite.query("SELECT updated_at FROM project WHERE id = 1").get() as { updated_at: number };
      expect(updated.updated_at).toBeGreaterThan(initialTimestamp);
      
    } finally {
      sqlite.close();
    }
  });

  test("should update todo timestamp when todo is modified", async () => {
    const { sqlite } = await initializeDatabase();
    
    try {
      // Create project and todo list first
      sqlite.exec(`
        INSERT INTO project (name, location) 
        VALUES ('Test Project', '${tempTestDir}')
      `);
      
      sqlite.exec(`
        INSERT INTO todo_list (project_id, name) 
        VALUES (1, 'Default List')
      `);
      
      // Insert a todo
      sqlite.exec(`
        INSERT INTO todo (todo_list_id, content) 
        VALUES (1, 'Test task')
      `);
      
      // Get the initial timestamp
      const initial = sqlite.query("SELECT updated_at FROM todo WHERE id = 1").get() as { updated_at: number };
      const initialTimestamp = initial.updated_at;
      
      // Wait a full second to ensure timestamp difference (SQLite unixepoch() has 1-second precision)
      await new Promise<void>(resolve => globalThis.setTimeout(resolve, 1100));
      
      // Update the todo
      sqlite.exec(`
        UPDATE todo SET content = 'Updated task' WHERE id = 1
      `);
      
      // Check that timestamp was updated
      const updated = sqlite.query("SELECT updated_at FROM todo WHERE id = 1").get() as { updated_at: number };
      expect(updated.updated_at).toBeGreaterThan(initialTimestamp);
      
    } finally {
      sqlite.close();
    }
  });

  test("should update todo_list timestamp when todo_list is modified", async () => {
    const { sqlite } = await initializeDatabase();
    
    try {
      // Create project first
      sqlite.exec(`
        INSERT INTO project (name, location) 
        VALUES ('Test Project', '${tempTestDir}')
      `);
      
      // Insert a todo list
      sqlite.exec(`
        INSERT INTO todo_list (project_id, name) 
        VALUES (1, 'Test List')
      `);
      
      // Get the initial timestamp
      const initial = sqlite.query("SELECT updated_at FROM todo_list WHERE id = 1").get() as { updated_at: number };
      const initialTimestamp = initial.updated_at;
      
      // Wait a full second to ensure timestamp difference (SQLite unixepoch() has 1-second precision)
      await new Promise<void>(resolve => globalThis.setTimeout(resolve, 1100));
      
      // Update the todo list
      sqlite.exec(`
        UPDATE todo_list SET name = 'Updated List' WHERE id = 1
      `);
      
      // Check that timestamp was updated
      const updated = sqlite.query("SELECT updated_at FROM todo_list WHERE id = 1").get() as { updated_at: number };
      expect(updated.updated_at).toBeGreaterThan(initialTimestamp);
      
    } finally {
      sqlite.close();
    }
  });

  test("should update todo_list timestamp when todos are added/modified/deleted", async () => {
    const { sqlite } = await initializeDatabase();
    
    try {
      // Create project and todo list
      sqlite.exec(`
        INSERT INTO project (name, location) 
        VALUES ('Test Project', '${tempTestDir}')
      `);
      
      sqlite.exec(`
        INSERT INTO todo_list (project_id, name) 
        VALUES (1, 'Test List')
      `);
      
      // Get initial todo list timestamp
      const initial = sqlite.query("SELECT updated_at FROM todo_list WHERE id = 1").get() as { updated_at: number };
      const initialTimestamp = initial.updated_at;
      
      // Wait a full second to ensure timestamp difference (SQLite unixepoch() has 1-second precision)
      await new Promise<void>(resolve => globalThis.setTimeout(resolve, 1100));
      
      // Insert a todo (should trigger todo list timestamp update)
      sqlite.exec(`
        INSERT INTO todo (todo_list_id, content) 
        VALUES (1, 'Test task')
      `);
      
      // Check that todo list timestamp was updated
      const afterInsert = sqlite.query("SELECT updated_at FROM todo_list WHERE id = 1").get() as { updated_at: number };
      expect(afterInsert.updated_at).toBeGreaterThan(initialTimestamp);
      
      // Wait a full second to ensure timestamp difference (SQLite unixepoch() has 1-second precision)
      await new Promise<void>(resolve => globalThis.setTimeout(resolve, 1100));
      
      // Update the todo (should trigger todo list timestamp update)
      sqlite.exec(`
        UPDATE todo SET content = 'Updated task' WHERE id = 1
      `);
      
      // Check that todo list timestamp was updated again
      const afterUpdate = sqlite.query("SELECT updated_at FROM todo_list WHERE id = 1").get() as { updated_at: number };
      expect(afterUpdate.updated_at).toBeGreaterThan(afterInsert.updated_at);
      
      // Wait a full second to ensure timestamp difference (SQLite unixepoch() has 1-second precision)
      await new Promise<void>(resolve => globalThis.setTimeout(resolve, 1100));
      
      // Delete the todo (should trigger todo list timestamp update)
      sqlite.exec(`
        DELETE FROM todo WHERE id = 1
      `);
      
      // Check that todo list timestamp was updated again
      const afterDelete = sqlite.query("SELECT updated_at FROM todo_list WHERE id = 1").get() as { updated_at: number };
      expect(afterDelete.updated_at).toBeGreaterThan(afterUpdate.updated_at);
      
    } finally {
      sqlite.close();
    }
  });

  test("should update todo_list statistics when todos are added", async () => {
    const { sqlite } = await initializeDatabase();
    
    try {
      // Create project and todo list
      sqlite.exec(`
        INSERT INTO project (name, location) 
        VALUES ('Test Project', '${tempTestDir}')
      `);
      
      sqlite.exec(`
        INSERT INTO todo_list (project_id, name) 
        VALUES (1, 'Test List')
      `);
      
      // Initially should have no todos
      let stats = sqlite.query("SELECT num_completed, total_count FROM todo_list WHERE id = 1").get() as { num_completed: number | null, total_count: number | null };
      expect(stats.num_completed).toBeNull();
      expect(stats.total_count).toBeNull();
      
      // Add a pending todo
      sqlite.exec(`
        INSERT INTO todo (todo_list_id, content, status) 
        VALUES (1, 'Test task', 'pending')
      `);
      
      // Check statistics updated
      stats = sqlite.query("SELECT num_completed, total_count FROM todo_list WHERE id = 1").get() as { num_completed: number, total_count: number };
      expect(stats.num_completed).toBe(0);
      expect(stats.total_count).toBe(1);
      
      // Add a completed todo
      sqlite.exec(`
        INSERT INTO todo (todo_list_id, content, status) 
        VALUES (1, 'Completed task', 'completed')
      `);
      
      // Check statistics updated
      stats = sqlite.query("SELECT num_completed, total_count FROM todo_list WHERE id = 1").get() as { num_completed: number, total_count: number };
      expect(stats.num_completed).toBe(1);
      expect(stats.total_count).toBe(2);
      
    } finally {
      sqlite.close();
    }
  });

  test("should update todo_list statistics when todo status changes", async () => {
    const { sqlite } = await initializeDatabase();
    
    try {
      // Create project and todo list with some todos
      sqlite.exec(`
        INSERT INTO project (name, location) 
        VALUES ('Test Project', '${tempTestDir}')
      `);
      
      sqlite.exec(`
        INSERT INTO todo_list (project_id, name) 
        VALUES (1, 'Test List')
      `);
      
      sqlite.exec(`
        INSERT INTO todo (todo_list_id, content, status) 
        VALUES (1, 'Task 1', 'pending'),
               (1, 'Task 2', 'pending')
      `);
      
      // Initial state: 0 completed, 2 total
      let stats = sqlite.query("SELECT num_completed, total_count FROM todo_list WHERE id = 1").get() as { num_completed: number, total_count: number };
      expect(stats.num_completed).toBe(0);
      expect(stats.total_count).toBe(2);
      
      // Complete one task
      sqlite.exec(`
        UPDATE todo SET status = 'completed' WHERE id = 1
      `);
      
      // Should now be 1 completed, 2 total
      stats = sqlite.query("SELECT num_completed, total_count FROM todo_list WHERE id = 1").get() as { num_completed: number, total_count: number };
      expect(stats.num_completed).toBe(1);
      expect(stats.total_count).toBe(2);
      
      // Complete the second task
      sqlite.exec(`
        UPDATE todo SET status = 'completed' WHERE id = 2
      `);
      
      // Should now be 2 completed, 2 total
      stats = sqlite.query("SELECT num_completed, total_count FROM todo_list WHERE id = 1").get() as { num_completed: number, total_count: number };
      expect(stats.num_completed).toBe(2);
      expect(stats.total_count).toBe(2);
      
      // Uncomplete one task
      sqlite.exec(`
        UPDATE todo SET status = 'pending' WHERE id = 1
      `);
      
      // Should now be 1 completed, 2 total
      stats = sqlite.query("SELECT num_completed, total_count FROM todo_list WHERE id = 1").get() as { num_completed: number, total_count: number };
      expect(stats.num_completed).toBe(1);
      expect(stats.total_count).toBe(2);
      
    } finally {
      sqlite.close();
    }
  });

  test("should update todo_list statistics when todos are deleted", async () => {
    const { sqlite } = await initializeDatabase();
    
    try {
      // Create project and todo list with some todos
      sqlite.exec(`
        INSERT INTO project (name, location) 
        VALUES ('Test Project', '${tempTestDir}')
      `);
      
      sqlite.exec(`
        INSERT INTO todo_list (project_id, name) 
        VALUES (1, 'Test List')
      `);
      
      sqlite.exec(`
        INSERT INTO todo (todo_list_id, content, status) 
        VALUES (1, 'Task 1', 'completed'),
               (1, 'Task 2', 'pending'),
               (1, 'Task 3', 'completed')
      `);
      
      // Initial state: 2 completed, 3 total
      let stats = sqlite.query("SELECT num_completed, total_count FROM todo_list WHERE id = 1").get() as { num_completed: number, total_count: number };
      expect(stats.num_completed).toBe(2);
      expect(stats.total_count).toBe(3);
      
      // Delete a completed task
      sqlite.exec(`
        DELETE FROM todo WHERE id = 1
      `);
      
      // Should now be 1 completed, 2 total
      stats = sqlite.query("SELECT num_completed, total_count FROM todo_list WHERE id = 1").get() as { num_completed: number, total_count: number };
      expect(stats.num_completed).toBe(1);
      expect(stats.total_count).toBe(2);
      
      // Delete a pending task
      sqlite.exec(`
        DELETE FROM todo WHERE id = 2
      `);
      
      // Should now be 1 completed, 1 total
      stats = sqlite.query("SELECT num_completed, total_count FROM todo_list WHERE id = 1").get() as { num_completed: number, total_count: number };
      expect(stats.num_completed).toBe(1);
      expect(stats.total_count).toBe(1);
      
      // Delete the last task
      sqlite.exec(`
        DELETE FROM todo WHERE id = 3
      `);
      
      // Should now be 0 completed, 0 total
      stats = sqlite.query("SELECT num_completed, total_count FROM todo_list WHERE id = 1").get() as { num_completed: number, total_count: number };
      expect(stats.num_completed).toBe(0);
      expect(stats.total_count).toBe(0);
      
    } finally {
      sqlite.close();
    }
  });
});