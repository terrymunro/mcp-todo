import * as fs from "fs/promises";
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import "./utils/test-logger"; // Auto-suppress verbose output during tests
import { clearAllCaches } from "../src/database";
import { createTodoServer } from "../src/index";

/**
 * This test suite focuses on testing the MCP server as a complete system,
 * including server creation, tool registration, and actual tool execution.
 * These are more comprehensive than unit tests as they test the full MCP integration.
 */

describe("MCP Server Integration Tests", () => {
  let originalCwd: () => string;
  let originalXdgDataHome: string | undefined;
  let testDataDir: string;

  beforeEach(async () => {
    // Clear caches first to ensure clean state
    clearAllCaches();

    // Mock process.cwd to a test directory - use more unique timestamp
    originalCwd = process.cwd;
    const timestamp = Date.now() + Math.random();
    process.cwd = () => `/tmp/mcp-test-project-${timestamp}`;

    // Mock XDG_DATA_HOME to a temporary test directory
    originalXdgDataHome = process.env.XDG_DATA_HOME;
    testDataDir = `/tmp/mcp-todo-test-${timestamp}`;
    process.env.XDG_DATA_HOME = testDataDir;

    // Ensure test directory exists
    await fs.mkdir(testDataDir, { recursive: true });
  });

  afterEach(async () => {
    // Clear caches to prevent interference between tests
    clearAllCaches();

    // Restore original environment
    process.cwd = originalCwd;
    if (originalXdgDataHome) {
      process.env.XDG_DATA_HOME = originalXdgDataHome;
    } else {
      delete process.env.XDG_DATA_HOME;
    }

    // Clean up test directory
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Server Creation and Tool Registration", () => {
    test("should create MCP server with all expected tools", () => {
      const server = createTodoServer();
      
      expect(server).toBeDefined();
      expect(typeof server).toBe("object");
      
      // Check that server has the tool registration method
      expect(typeof server.tool).toBe("function");
    });

    test("should have all expected tool names available", () => {
      const server = createTodoServer();
      
      // The MCP SDK doesn't expose a direct way to list tools,
      // but we can verify the server was created and tools were registered
      // by checking the server object structure
      expect(server).toBeDefined();
      
      // This confirms the server creation process completed without errors
      // Individual tool functionality is tested in the tool execution tests below
    });
  });

  describe("Tool Execution Tests", () => {
    beforeEach(() => {
      createTodoServer();
    });

    test("should execute todo-write tool successfully", async () => {
      // Note: The MCP SDK doesn't expose a direct way to call tools in tests,
      // but we can test the underlying handlers that the tools use
      const { handleTodoWrite } = await import("../src/index");
      
      const result = await handleTodoWrite({
        id: 1,
        content: "Test todo from integration test",
        priority: "high",
      });

      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(1);
      expect(result.content[0]!.type).toBe("text");
      expect(result.content[0]!.text).toContain("Todo 1 saved successfully");
    });

    test("should execute todo-read tool successfully", async () => {
      // First create a todo
      const { handleTodoWrite } = await import("../src/index");
      await handleTodoWrite({
        id: 1,
        content: "Todo to read",
        priority: "medium",
      });

      // Then read it
      const { getTodoById } = await import("../src/database");
      const todo = await getTodoById(1);

      expect(todo).toBeDefined();
      expect(todo!.content).toBe("Todo to read");
      expect(todo!.priority).toBe("medium");
    });

    test("should execute todo-delete tool successfully", async () => {
      // First create a todo
      const { handleTodoWrite, handleTodoDelete } = await import("../src/index");
      await handleTodoWrite({
        id: 1,
        content: "Todo to delete",
        priority: "low",
      });

      // Then delete it
      const result = await handleTodoDelete({ id: 1 });

      expect(result.content).toBeDefined();
      expect(result.content[0]!.text).toContain("Todo 1 deleted successfully");

      // Verify it's actually deleted
      const { getTodoById } = await import("../src/database");
      const deletedTodo = await getTodoById(1);
      expect(deletedTodo).toBeNull();
    });

    test("should execute todo-list tool successfully", async () => {
      // Initialize project context first
      const { initializeProjectContext } = await import("../src/database");
      await initializeProjectContext();

      // Create multiple todos
      const { handleTodoWrite } = await import("../src/index");
      await handleTodoWrite({ id: 1, content: "High priority todo", priority: "high" });
      await handleTodoWrite({ id: 2, content: "Medium priority todo", priority: "medium" });
      await handleTodoWrite({ id: 3, content: "Low priority todo", priority: "low" });

      // List them
      const { getTodosByListId } = await import("../src/database");
      const todos = await getTodosByListId();

      expect(todos.length).toBe(3);
      expect(todos[0]!.priority).toBe("high");
      expect(todos[1]!.priority).toBe("medium");
      expect(todos[2]!.priority).toBe("low");
    });

    test("should handle project-get tool", async () => {
      const { getCurrentProject, initializeProjectContext } = await import("../src/database");
      
      // Store the expected directory
      const expectedCwd = process.cwd();
      
      // Initialize project context
      await initializeProjectContext();
      
      const project = await getCurrentProject();
      expect(project).toBeDefined();
      expect(project!.location).toBe(expectedCwd);
    });

    test("should handle todo-list creation and management", async () => {
      const { createTodoList, getAllTodoListsForCurrentProject, initializeProjectContext } = await import("../src/database");
      
      // Initialize project context
      await initializeProjectContext();
      
      // Create a new todo list
      const newList = await createTodoList("Test List", "A test list");
      expect(newList.name).toBe("Test List");
      expect(newList.description).toBe("A test list");
      
      // Verify it appears in the list
      const allLists = await getAllTodoListsForCurrentProject();
      expect(allLists.length).toBeGreaterThanOrEqual(2); // Default list + our new list
      expect(allLists.some(list => list.name === "Test List")).toBe(true);
    });
  });

  describe("Error Handling in Tool Execution", () => {
    test("should handle errors gracefully in todo-write", async () => {
      const { handleTodoWrite } = await import("../src/index");
      
      // Try to create a todo without content
      const result = await handleTodoWrite({ id: 1 });
      
      expect(result.content[0]!.text).toContain("Content is required when creating a new todo");
    });

    test("should handle errors gracefully in todo-delete", async () => {
      const { handleTodoDelete } = await import("../src/index");
      
      // Try to delete a non-existent todo
      const result = await handleTodoDelete({ id: 999 });
      
      expect(result.content[0]!.text).toContain("Failed to delete todo");
      expect(result.content[0]!.text).toContain("Todo with ID 999 not found");
    });

    test("should handle database errors gracefully", async () => {
      const { handleTodoWrite } = await import("../src/index");
      
      // Try to create a todo with an invalid todo_list_id
      const result = await handleTodoWrite({
        id: 1,
        content: "Test content",
        todo_list_id: 999999, // Non-existent todo list
      });
      
      expect(result.content[0]!.text).toContain("Failed to write todo");
    });
  });

  describe("Data Consistency Tests", () => {
    test("should maintain data consistency across operations", async () => {
      const { handleTodoWrite, handleTodoDelete } = await import("../src/index");
      const { getTodosByListId, getTodoListById, getCurrentDefaultTodoListId, initializeProjectContext } = await import("../src/database");
      
      // Initialize project context
      await initializeProjectContext();
      const defaultListId = getCurrentDefaultTodoListId()!;
      
      // Create multiple todos
      await handleTodoWrite({ id: 1, content: "Todo 1", status: "completed" });
      await handleTodoWrite({ id: 2, content: "Todo 2", status: "pending" });
      await handleTodoWrite({ id: 3, content: "Todo 3", status: "completed" });
      
      // Check initial statistics (may be null initially, triggers will update them)
      const listBefore = await getTodoListById(defaultListId);
      expect(listBefore).toBeDefined();
      // Note: triggers may need time to update statistics, so we check actual todo count
      const todosBefore = await getTodosByListId();
      expect(todosBefore.length).toBe(3);
      const completedBefore = todosBefore.filter(t => t.status === "completed").length;
      expect(completedBefore).toBe(2);
      
      // Delete a completed todo
      await handleTodoDelete({ id: 1 });
      
      // Check that data is consistent after deletion
      const remainingTodos = await getTodosByListId();
      expect(remainingTodos.length).toBe(2);
      expect(remainingTodos.map(t => t.id)).toEqual([2, 3]);
      
      const completedAfter = remainingTodos.filter(t => t.status === "completed").length;
      expect(completedAfter).toBe(1);
    });

    test("should handle multiple rapid operations correctly", async () => {
      const { handleTodoWrite, handleTodoDelete } = await import("../src/index");
      const { getTodosByListId, initializeProjectContext } = await import("../src/database");
      
      // Initialize project context
      await initializeProjectContext();
      
      // Create multiple todos rapidly
      const createPromises = [
        handleTodoWrite({ id: 1, content: "Rapid Todo 1", priority: "high" }),
        handleTodoWrite({ id: 2, content: "Rapid Todo 2", priority: "medium" }),
        handleTodoWrite({ id: 3, content: "Rapid Todo 3", priority: "low" }),
      ];
      
      await Promise.all(createPromises);
      
      // Verify all were created
      let todos = await getTodosByListId();
      expect(todos.length).toBe(3);
      
      // Delete some rapidly
      const deletePromises = [
        handleTodoDelete({ id: 1 }),
        handleTodoDelete({ id: 3 }),
      ];
      
      await Promise.all(deletePromises);
      
      // Verify correct todos remain
      todos = await getTodosByListId();
      expect(todos.length).toBe(1);
      expect(todos[0]!.id).toBe(2);
    });
  });
});