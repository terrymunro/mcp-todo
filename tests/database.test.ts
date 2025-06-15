import * as fs from "fs/promises";
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import "./utils/test-logger"; // Auto-suppress verbose output during tests

import {
  initializeProjectContext,
  getCurrentProject,
  getCurrentDefaultTodoListId,
  getTodoListById,
  getTodosByListId,
  saveTodo,
  getTodoById,
  deleteTodo,
  createTodoList,
  clearAllCaches,
} from "../src/database";

/**
 * This test-suite focuses on the higher-level helpers found in database.ts.
 * It intentionally spins up a *real* SQLite database on disk (in a temporary
 * directory) so that we exercise all SQL code-paths exactly the same way the
 * production server does.
 */

describe("database.ts – high-level helpers (SQL integration)", () => {
  /*
   * Every test gets its own unique XDG data directory so that there is zero
   * cross-test interference even when Bun runs the tests in parallel.
   */
  let testDataDir: string;
  let originalCwd: () => string;
  let originalXdg: string | undefined;

  beforeEach(async () => {
    // 1. Isolate cwd – pretend we are inside “/tmp/<uuid>/project”.
    originalCwd = process.cwd;
    const projectDir = `/tmp/mcp-todo-test-project-${Date.now()}`;
    process.cwd = () => projectDir;
    await fs.mkdir(projectDir, { recursive: true });

    // 2. Point XDG_DATA_HOME at a unique dir.
    originalXdg = process.env.XDG_DATA_HOME;
    testDataDir = `/tmp/mcp-todo-xdg-${Date.now()}`;
    process.env.XDG_DATA_HOME = testDataDir;
    await fs.mkdir(testDataDir, { recursive: true });
  });

  afterEach(async () => {
    // Clear both project cache and database connection cache to ensure tests start with fresh state
    clearAllCaches();

    // Restore env/cwd
    process.cwd = originalCwd;
    if (originalXdg !== undefined) {
      process.env.XDG_DATA_HOME = originalXdg;
    } else {
      delete process.env.XDG_DATA_HOME;
    }

    // Best-effort cleanup (ignore errors – e.g. if path doesn’t exist)
    await fs.rm(testDataDir, { recursive: true, force: true }).catch(() => {});
  });

  // ---------------------------------------------------------------------------
  // Project boot-strapping
  // ---------------------------------------------------------------------------

  test("initializeProjectContext() creates a project and default todo list", async () => {
    await initializeProjectContext();

    const project = await getCurrentProject();
    expect(project).toBeDefined();
    expect(project!.location).toBe(process.cwd());
    expect(project!.default_todo_list_id).toBeGreaterThan(0);

    // Verify the default list really exists
    const list = await getTodoListById(project!.default_todo_list_id!);
    expect(list).toBeDefined();
    expect(list!.project_id).toBe(project!.id);

    // And that helper keeps the ID in memory
    expect(getCurrentDefaultTodoListId()).toBe(project!.default_todo_list_id);
  });

  // ---------------------------------------------------------------------------
  // Todo CRUD helpers
  // ---------------------------------------------------------------------------

  test("saveTodo() – create + update + query ordering", async () => {
    await initializeProjectContext();
    const todoListId = getCurrentDefaultTodoListId()!;

    // 1. Create new todo  (id = 1)
    const created = await saveTodo({
      id: 1,
      content: "Write SQL integration tests",
      priority: "high",
    });

    expect(created.id).toBe(1);
    expect(created.todo_list_id).toBe(todoListId);
    expect(created.priority).toBe("high");
    expect(created.status).toBe("pending");

    // 2. Patch – change only the status
    const updated = await saveTodo({ id: 1, status: "completed" });
    expect(updated.status).toBe("completed");
    expect(updated.priority).toBe("high"); // unchanged

    // 3. Create a few more todos with various priorities
    await saveTodo({ id: 2, content: "Medium priority", priority: "medium" });
    await saveTodo({ id: 3, content: "Low priority", priority: "low" });

    // 4. Verify ordering helper (high → medium → low)
    const todos = await getTodosByListId(); // default list
    expect(todos.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  // ---------------------------------------------------------------------------
  // Additional helpers
  // ---------------------------------------------------------------------------

  test("createTodoList() creates list attached to current project", async () => {
    await initializeProjectContext();

    const newList = await createTodoList("New List", "optional description");
    const project = await getCurrentProject();

    expect(newList.project_id).toBe(project!.id);
    expect(newList.name).toBe("New List");
  });

  // ---------------------------------------------------------------------------
  // Edge-cases & validations
  // ---------------------------------------------------------------------------

  test("saveTodo() rejects unknown todo_list_id", async () => {
    await initializeProjectContext();

    const result = saveTodo({
      id: 42,
      content: "Orphan todo",
      todo_list_id: 9999, // definitely doesn’t exist
    });

    await expect(result).rejects.toThrow("Todo list with ID 9999 not found");
  });

  test("saveTodo() requires content when creating new todo", async () => {
    await initializeProjectContext();

    // No existing todo with id 100; call without content → should reject
    const res = saveTodo({ id: 100 });
    await expect(res).rejects.toThrow("Content is required when creating a new todo");
  });

  // ---------------------------------------------------------------------------
  // Todo deletion tests
  // ---------------------------------------------------------------------------

  test("deleteTodo() successfully deletes existing todo", async () => {
    await initializeProjectContext();
    
    // Create a todo to delete
    await saveTodo({ id: 1, content: "Todo to delete", priority: "low" });
    
    // Verify it exists
    const beforeDelete = await getTodoById(1);
    expect(beforeDelete).toBeDefined();
    expect(beforeDelete!.content).toBe("Todo to delete");
    
    // Delete it
    await deleteTodo(1);
    
    // Verify it's gone
    const afterDelete = await getTodoById(1);
    expect(afterDelete).toBeNull();
  });

  test("deleteTodo() throws error for non-existent todo", async () => {
    await initializeProjectContext();
    
    // Try to delete a todo that doesn't exist
    const result = deleteTodo(999);
    await expect(result).rejects.toThrow("Todo with ID 999 not found");
  });

  test("deleteTodo() updates todo list statistics via triggers", async () => {
    await initializeProjectContext();
    const todoListId = getCurrentDefaultTodoListId()!;
    
    // Create several todos
    await saveTodo({ id: 1, content: "Todo 1", status: "completed" });
    await saveTodo({ id: 2, content: "Todo 2", status: "pending" });
    await saveTodo({ id: 3, content: "Todo 3", status: "completed" });
    
    // Check initial statistics
    const listBefore = await getTodoListById(todoListId);
    expect(listBefore!.total_count).toBe(3);
    expect(listBefore!.num_completed).toBe(2);
    
    // Delete one completed todo
    await deleteTodo(1);
    
    // Check updated statistics
    const listAfter = await getTodoListById(todoListId);
    expect(listAfter!.total_count).toBe(2);
    expect(listAfter!.num_completed).toBe(1);
  });

  test("deleteTodo() removes todo from getTodosByListId results", async () => {
    await initializeProjectContext();
    
    // Create multiple todos
    await saveTodo({ id: 1, content: "Todo 1", priority: "high" });
    await saveTodo({ id: 2, content: "Todo 2", priority: "medium" });
    await saveTodo({ id: 3, content: "Todo 3", priority: "low" });
    
    // Verify all are in the list
    const beforeDelete = await getTodosByListId();
    expect(beforeDelete.length).toBe(3);
    expect(beforeDelete.map(t => t.id)).toEqual([1, 2, 3]); // sorted by priority
    
    // Delete the middle priority todo
    await deleteTodo(2);
    
    // Verify it's removed from the list
    const afterDelete = await getTodosByListId();
    expect(afterDelete.length).toBe(2);
    expect(afterDelete.map(t => t.id)).toEqual([1, 3]);
  });
});
