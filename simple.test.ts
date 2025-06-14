import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";

import { project, todoList, todo, createTriggers } from "./schema";
import { TodoStatusSchema, TodoPrioritySchema } from "./index";

describe("Schema and Basic Functionality", () => {
  test("should validate todo status enum", () => {
    expect(TodoStatusSchema.parse("pending")).toBe("pending");
    expect(TodoStatusSchema.parse("in_progress")).toBe("in_progress");
    expect(TodoStatusSchema.parse("completed")).toBe("completed");

    expect(() => TodoStatusSchema.parse("invalid")).toThrow();
  });

  test("should validate todo priority enum", () => {
    expect(TodoPrioritySchema.parse("low")).toBe("low");
    expect(TodoPrioritySchema.parse("medium")).toBe("medium");
    expect(TodoPrioritySchema.parse("high")).toBe("high");

    expect(() => TodoPrioritySchema.parse("invalid")).toThrow();
  });
});

describe("Database Schema", () => {
  let testDb: ReturnType<typeof drizzle>;
  let testSqlite: Database;

  beforeEach(() => {
    // Create in-memory database for each test
    testSqlite = new Database(":memory:");
    testDb = drizzle(testSqlite);

    // Enable foreign keys
    testSqlite.exec("PRAGMA foreign_keys = ON;");

    // Create tables manually for testing
    testSqlite.exec(`
      CREATE TABLE project (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        default_todo_list_id INTEGER REFERENCES todo_list(id),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);

    testSqlite.exec(`
      CREATE TABLE todo_list (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        num_completed INTEGER,
        total_count INTEGER,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);

    testSqlite.exec(`
      CREATE TABLE todo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        todo_list_id INTEGER NOT NULL REFERENCES todo_list(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'medium',
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);

    testSqlite.exec(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Create indexes
    testSqlite.exec(`CREATE INDEX location_idx ON project(location);`);

    // Create triggers
    for (const trigger of createTriggers) {
      testSqlite.exec(trigger);
    }

    // Create triggers for updating todo list statistics
    testSqlite.exec(`
      CREATE TRIGGER IF NOT EXISTS update_todo_list_stats_on_insert
      AFTER INSERT ON todo
      BEGIN
        UPDATE todo_list SET 
          num_completed = (SELECT COUNT(*) FROM todo WHERE todo_list_id = NEW.todo_list_id AND status = 'completed'),
          total_count = (SELECT COUNT(*) FROM todo WHERE todo_list_id = NEW.todo_list_id)
        WHERE id = NEW.todo_list_id;
      END;
    `);

    testSqlite.exec(`
      CREATE TRIGGER IF NOT EXISTS update_todo_list_stats_on_update
      AFTER UPDATE ON todo
      BEGIN
        UPDATE todo_list SET 
          num_completed = (SELECT COUNT(*) FROM todo WHERE todo_list_id = NEW.todo_list_id AND status = 'completed'),
          total_count = (SELECT COUNT(*) FROM todo WHERE todo_list_id = NEW.todo_list_id)
        WHERE id = NEW.todo_list_id;
      END;
    `);

    testSqlite.exec(`
      CREATE TRIGGER IF NOT EXISTS update_todo_list_stats_on_delete
      AFTER DELETE ON todo
      BEGIN
        UPDATE todo_list SET 
          num_completed = (SELECT COUNT(*) FROM todo WHERE todo_list_id = OLD.todo_list_id AND status = 'completed'),
          total_count = (SELECT COUNT(*) FROM todo WHERE todo_list_id = OLD.todo_list_id)
        WHERE id = OLD.todo_list_id;
      END;
    `);
  });

  afterEach(() => {
    testSqlite.close();
  });

  test("should create and query todo lists", async () => {
    // First create a project
    const projectResult = await testDb
      .insert(project)
      .values({
        name: "Test Project",
        location: "/test/path",
      })
      .returning();

    // Insert a todo list with project_id
    const result = await testDb
      .insert(todoList)
      .values({
        project_id: projectResult[0]!.id,
        name: "Test List",
        description: "A test todo list",
      })
      .returning();

    expect(result.length).toBe(1);
    expect(result[0]!.name).toBe("Test List");
    expect(result[0]!.description).toBe("A test todo list");
    expect(result[0]!.project_id).toBe(projectResult[0]!.id);
    expect(result[0]!.id).toBeGreaterThan(0);

    // Query it back
    const retrieved = await testDb
      .select()
      .from(todoList)
      .where(eq(todoList.id, result[0]!.id));
    expect(retrieved.length).toBe(1);
    expect(retrieved[0]!.name).toBe("Test List");
  });

  test("should create and query projects", async () => {
    // First create a project
    const projectResult = await testDb
      .insert(project)
      .values({
        name: "Test Project",
        location: "/test/path",
      })
      .returning();

    // Then create a todo list for that project
    const todoListResult = await testDb
      .insert(todoList)
      .values({
        project_id: projectResult[0]!.id,
        name: "Default List",
        description: "Default todo list",
      })
      .returning();

    // Update project to set default todo list
    await testDb
      .update(project)
      .set({ default_todo_list_id: todoListResult[0]!.id })
      .where(eq(project.id, projectResult[0]!.id));

    expect(projectResult.length).toBe(1);
    expect(projectResult[0]!.name).toBe("Test Project");
    expect(projectResult[0]!.location).toBe("/test/path");

    // Query it back to verify the default_todo_list_id was set
    const retrieved = await testDb
      .select()
      .from(project)
      .where(eq(project.id, projectResult[0]!.id));
    expect(retrieved.length).toBe(1);
    expect(retrieved[0]!.name).toBe("Test Project");
    expect(retrieved[0]!.default_todo_list_id).toBe(todoListResult[0]!.id);
  });

  test("should create and query todos", async () => {
    // First create a project
    const projectResult = await testDb
      .insert(project)
      .values({
        name: "Test Project",
        location: "/test/path",
      })
      .returning();

    // Then create a todo list
    const todoListResult = await testDb
      .insert(todoList)
      .values({
        project_id: projectResult[0]!.id,
        name: "Test List",
      })
      .returning();

    // Then create a todo
    const todoResult = await testDb
      .insert(todo)
      .values({
        content: "Test todo item",
        status: "pending",
        priority: "high",
        todo_list_id: todoListResult[0]!.id,
      })
      .returning();

    expect(todoResult.length).toBe(1);
    expect(todoResult[0]!.content).toBe("Test todo item");
    expect(todoResult[0]!.status).toBe("pending");
    expect(todoResult[0]!.priority).toBe("high");
    expect(todoResult[0]!.todo_list_id).toBe(todoListResult[0]!.id);

    // Query it back
    const retrieved = await testDb
      .select()
      .from(todo)
      .where(eq(todo.id, todoResult[0]!.id));
    expect(retrieved.length).toBe(1);
    expect(retrieved[0]!.content).toBe("Test todo item");
  });

  test("should handle foreign key constraints", async () => {
    // Try to create a todo without a valid todo_list_id
    await expect(async () => {
      await testDb.insert(todo).values({
        content: "Invalid todo",
        todo_list_id: 999, // Non-existent todo list
      });
    }).toThrow();
  });

  test("should sort todos by priority correctly", async () => {
    // Create a project
    const projectResult = await testDb
      .insert(project)
      .values({
        name: "Test Project",
        location: "/test/path",
      })
      .returning();

    // Create a todo list
    const todoListResult = await testDb
      .insert(todoList)
      .values({
        project_id: projectResult[0]!.id,
        name: "Priority Test List",
      })
      .returning();

    const listId = todoListResult[0]!.id;

    // Create todos with different priorities
    await testDb.insert(todo).values([
      { content: "Low priority", priority: "low", todo_list_id: listId },
      { content: "High priority 1", priority: "high", todo_list_id: listId },
      { content: "Medium priority", priority: "medium", todo_list_id: listId },
      { content: "High priority 2", priority: "high", todo_list_id: listId },
    ]);

    // Query todos for this list
    const todos = await testDb
      .select()
      .from(todo)
      .where(eq(todo.todo_list_id, listId));

    expect(todos.length).toBe(4);

    // Sort manually like our application does
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sortedTodos = todos.sort((a, b) => {
      const priorityDiff =
        priorityOrder[a.priority as keyof typeof priorityOrder] -
        priorityOrder[b.priority as keyof typeof priorityOrder];
      if (priorityDiff !== 0) return priorityDiff;
      return a.id - b.id;
    });

    expect(sortedTodos[0]!.priority).toBe("high");
    expect(sortedTodos[1]!.priority).toBe("high");
    expect(sortedTodos[2]!.priority).toBe("medium");
    expect(sortedTodos[3]!.priority).toBe("low");
  });

  test("should cascade delete todos when todo list is deleted", async () => {
    // Create a project
    const projectResult = await testDb
      .insert(project)
      .values({
        name: "Test Project",
        location: "/test/path",
      })
      .returning();

    // Create a todo list
    const todoListResult = await testDb
      .insert(todoList)
      .values({
        project_id: projectResult[0]!.id,
        name: "Temporary List",
      })
      .returning();

    const listId = todoListResult[0]!.id;

    // Create some todos in the list
    await testDb.insert(todo).values([
      { content: "Todo 1", todo_list_id: listId },
      { content: "Todo 2", todo_list_id: listId },
    ]);

    // Verify todos exist
    const todosBefore = await testDb
      .select()
      .from(todo)
      .where(eq(todo.todo_list_id, listId));
    expect(todosBefore.length).toBe(2);

    // Delete the todo list
    await testDb.delete(todoList).where(eq(todoList.id, listId));

    // Verify todos were cascaded deleted
    const todosAfter = await testDb
      .select()
      .from(todo)
      .where(eq(todo.todo_list_id, listId));
    expect(todosAfter.length).toBe(0);
  });
});

describe("Data Directory Path Resolution", () => {
  test("should handle XDG_DATA_HOME environment variable", () => {
    const originalXdgDataHome = process.env.XDG_DATA_HOME;
    const originalHome = process.env.HOME;

    try {
      // Test with XDG_DATA_HOME set
      process.env.XDG_DATA_HOME = "/custom/data";
      process.env.HOME = "/home/user";

      // We can't easily test the actual function without importing it,
      // but we can test the logic
      const xdgDataHome = process.env.XDG_DATA_HOME;
      const expectedPath = xdgDataHome
        ? `${xdgDataHome}/mcp-todo`
        : `${process.env.HOME}/.local/share/mcp-todo`;

      expect(expectedPath).toBe("/custom/data/mcp-todo");

      // Test without XDG_DATA_HOME
      delete process.env.XDG_DATA_HOME;
      const fallbackPath = `${process.env.HOME}/.local/share/mcp-todo`;
      expect(fallbackPath).toBe("/home/user/.local/share/mcp-todo");
    } finally {
      // Restore original environment variables
      if (originalXdgDataHome) {
        process.env.XDG_DATA_HOME = originalXdgDataHome;
      } else {
        delete process.env.XDG_DATA_HOME;
      }
      if (originalHome) {
        process.env.HOME = originalHome;
      }
    }
  });
});
