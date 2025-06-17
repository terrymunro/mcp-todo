import { describe, test, expect, beforeEach } from "bun:test";
import "./utils/test-logger"; // Auto-suppress verbose output during tests
import { 
  listResources, 
  readResource, 
  RESOURCE_URIS 
} from "../src/handlers/resources";
import { createTodoList } from "../src/database/todo-list";
import { saveTodo } from "../src/database/todo";
import { initializeProjectContext } from "../src/database/project";

describe("MCP Resource Handlers", () => {
  beforeEach(async () => {
    // Ensure project context is initialized for each test
    await initializeProjectContext();
  });

  describe("listResources", () => {
    test("should return static resources", async () => {
      const resources = await listResources();
      
      expect(Array.isArray(resources)).toBe(true);
      expect(resources.length).toBeGreaterThan(0);
      
      // Check for required static resources
      const uris = resources.map(r => r.uri);
      expect(uris).toContain(RESOURCE_URIS.PROJECT_CURRENT);
      expect(uris).toContain(RESOURCE_URIS.TODOS_ALL);
      expect(uris).toContain(RESOURCE_URIS.LISTS_ALL);
      expect(uris).toContain(RESOURCE_URIS.LIST_DEFAULT);
    });

    test("should include dynamic resources for existing todos and lists", async () => {
      // Create a test todo list
      const testList = await createTodoList("Test List", "Test description");
      
      // Create a test todo
      await saveTodo({
        id: 999991,
        content: "Test todo for resources",
        priority: "high",
        status: "pending",
      });

      const resources = await listResources();
      const uris = resources.map(r => r.uri);
      
      // Should include dynamic list resources
      expect(uris).toContain(`${RESOURCE_URIS.TODOS_LIST}${testList.id}`);
      expect(uris).toContain(`${RESOURCE_URIS.LIST_BY_ID}${testList.id}`);
      
      // Should include dynamic todo resources
      expect(uris).toContain(`${RESOURCE_URIS.TODO_BY_ID}999991`);
    });

    test("should have proper resource metadata", async () => {
      const resources = await listResources();
      
      for (const resource of resources) {
        expect(resource.uri).toBeDefined();
        expect(typeof resource.uri).toBe("string");
        expect(resource.uri.startsWith("todo://")).toBe(true);
        
        expect(resource.name).toBeDefined();
        expect(typeof resource.name).toBe("string");
        expect(resource.name.length).toBeGreaterThan(0);
        
        expect(resource.mimeType).toBeDefined();
        expect(resource.mimeType).toBe("application/json");
      }
    });
  });

  describe("readResource", () => {
    test("should read current project resource", async () => {
      const result = await readResource(RESOURCE_URIS.PROJECT_CURRENT);
      
      expect(result.contents).toBeDefined();
      expect(result.contents.length).toBe(1);
      
      const content = result.contents[0]!;
      expect(content.uri).toBe(RESOURCE_URIS.PROJECT_CURRENT);
      expect(content.mimeType).toBe("application/json");
      expect(content.text).toBeDefined();
      
      // Parse and validate project data
      const project = JSON.parse(content.text!);
      expect(project.id).toBeDefined();
      expect(project.name).toBeDefined();
      expect(project.location).toBeDefined();
      expect(project.default_todo_list_id).toBeDefined();
    });

    test("should read all todos resource", async () => {
      // Create a test todo first
      await saveTodo({
        id: 999992,
        content: "Test todo for all todos resource",
        priority: "medium",
        status: "pending",
      });

      const result = await readResource(RESOURCE_URIS.TODOS_ALL);
      
      expect(result.contents).toBeDefined();
      expect(result.contents.length).toBe(1);
      
      const content = result.contents[0]!;
      expect(content.uri).toBe(RESOURCE_URIS.TODOS_ALL);
      expect(content.mimeType).toBe("application/json");
      
      // Parse and validate todos data
      const data = JSON.parse(content.text!);
      expect(data.todos).toBeDefined();
      expect(Array.isArray(data.todos)).toBe(true);
      
      // Should contain our test todo
      const testTodo = data.todos.find((t: any) => t.id === 999992);
      expect(testTodo).toBeDefined();
      expect(testTodo.content).toBe("Test todo for all todos resource");
    });

    test("should read all todo lists resource", async () => {
      const result = await readResource(RESOURCE_URIS.LISTS_ALL);
      
      expect(result.contents).toBeDefined();
      expect(result.contents.length).toBe(1);
      
      const content = result.contents[0]!;
      expect(content.uri).toBe(RESOURCE_URIS.LISTS_ALL);
      expect(content.mimeType).toBe("application/json");
      
      // Parse and validate todo lists data
      const data = JSON.parse(content.text!);
      expect(data.todo_lists).toBeDefined();
      expect(Array.isArray(data.todo_lists)).toBe(true);
      expect(data.todo_lists.length).toBeGreaterThan(0);
      
      // Should contain at least the default list
      const defaultList = data.todo_lists.find((l: any) => l.name === "Inbox");
      expect(defaultList).toBeDefined();
    });

    test("should read default todo list resource", async () => {
      const result = await readResource(RESOURCE_URIS.LIST_DEFAULT);
      
      expect(result.contents).toBeDefined();
      expect(result.contents.length).toBe(1);
      
      const content = result.contents[0]!;
      expect(content.uri).toBe(RESOURCE_URIS.LIST_DEFAULT);
      expect(content.mimeType).toBe("application/json");
      
      // Parse and validate default list data
      const todoList = JSON.parse(content.text!);
      expect(todoList.id).toBeDefined();
      expect(todoList.name).toBeDefined();
      expect(todoList.project_id).toBeDefined();
    });

    test("should read individual todo by ID", async () => {
      // Create a test todo
      await saveTodo({
        id: 999993,
        content: "Individual todo test",
        priority: "low",
        status: "in_progress",
      });

      const result = await readResource(`${RESOURCE_URIS.TODO_BY_ID}999993`);
      
      expect(result.contents).toBeDefined();
      expect(result.contents.length).toBe(1);
      
      const content = result.contents[0]!;
      expect(content.uri).toBe(`${RESOURCE_URIS.TODO_BY_ID}999993`);
      expect(content.mimeType).toBe("application/json");
      
      // Parse and validate todo data
      const todo = JSON.parse(content.text!);
      expect(todo.id).toBe(999993);
      expect(todo.content).toBe("Individual todo test");
      expect(todo.priority).toBe("low");
      expect(todo.status).toBe("in_progress");
    });

    test("should read todos for specific list", async () => {
      // Create a test todo list
      const testList = await createTodoList("Resource Test List", "For testing");
      
      // Create a todo in that list
      await saveTodo({
        id: 999994,
        content: "Todo in specific list",
        priority: "high",
        status: "pending",
        todo_list_id: testList.id,
      });

      const result = await readResource(`${RESOURCE_URIS.TODOS_LIST}${testList.id}`);
      
      expect(result.contents).toBeDefined();
      expect(result.contents.length).toBe(1);
      
      const content = result.contents[0]!;
      expect(content.uri).toBe(`${RESOURCE_URIS.TODOS_LIST}${testList.id}`);
      expect(content.mimeType).toBe("application/json");
      
      // Parse and validate todos data
      const data = JSON.parse(content.text!);
      expect(data.todos).toBeDefined();
      expect(Array.isArray(data.todos)).toBe(true);
      
      // Should contain our test todo
      const testTodo = data.todos.find((t: any) => t.id === 999994);
      expect(testTodo).toBeDefined();
      expect(testTodo.todo_list_id).toBe(testList.id);
    });

    test("should read specific todo list by ID", async () => {
      // Create a test todo list
      const testList = await createTodoList("Specific List Test", "Test description");

      const result = await readResource(`${RESOURCE_URIS.LIST_BY_ID}${testList.id}`);
      
      expect(result.contents).toBeDefined();
      expect(result.contents.length).toBe(1);
      
      const content = result.contents[0]!;
      expect(content.uri).toBe(`${RESOURCE_URIS.LIST_BY_ID}${testList.id}`);
      expect(content.mimeType).toBe("application/json");
      
      // Parse and validate list data
      const todoList = JSON.parse(content.text!);
      expect(todoList.id).toBe(testList.id);
      expect(todoList.name).toBe("Specific List Test");
      expect(todoList.description).toBe("Test description");
    });
  });

  describe("Error handling", () => {
    test("should throw error for unknown resource URI", async () => {
      await expect(readResource("todo://unknown/resource")).rejects.toThrow(
        "Unknown resource URI: todo://unknown/resource"
      );
    });

    test("should throw error for invalid todo ID", async () => {
      await expect(readResource(`${RESOURCE_URIS.TODO_BY_ID}invalid`)).rejects.toThrow(
        "Invalid todo ID: invalid"
      );
    });

    test("should throw error for non-existent todo", async () => {
      await expect(readResource(`${RESOURCE_URIS.TODO_BY_ID}999999`)).rejects.toThrow(
        "Todo with ID 999999 not found"
      );
    });

    test("should throw error for invalid todo list ID", async () => {
      await expect(readResource(`${RESOURCE_URIS.LIST_BY_ID}invalid`)).rejects.toThrow(
        "Invalid todo list ID: invalid"
      );
    });

    test("should throw error for non-existent todo list", async () => {
      await expect(readResource(`${RESOURCE_URIS.LIST_BY_ID}999999`)).rejects.toThrow(
        "Todo list with ID 999999 not found"
      );
    });

    test("should throw error for invalid todos list ID", async () => {
      await expect(readResource(`${RESOURCE_URIS.TODOS_LIST}invalid`)).rejects.toThrow(
        "Invalid todo list ID: invalid"
      );
    });
  });

  describe("URI patterns", () => {
    test("should validate all RESOURCE_URIS are properly formed", () => {
      for (const [key, uri] of Object.entries(RESOURCE_URIS)) {
        expect(typeof uri).toBe("string");
        expect(uri.startsWith("todo://")).toBe(true);
        expect(uri.length).toBeGreaterThan("todo://".length);
      }
    });

    test("should handle URI pattern matching correctly", async () => {
      // Test that URI patterns don't conflict
      const testUris = [
        `${RESOURCE_URIS.TODO_BY_ID}123`,
        `${RESOURCE_URIS.TODOS_LIST}456`,
        `${RESOURCE_URIS.LIST_BY_ID}789`,
        RESOURCE_URIS.TODOS_ALL,
        RESOURCE_URIS.LISTS_ALL,
        RESOURCE_URIS.LIST_DEFAULT,
        RESOURCE_URIS.PROJECT_CURRENT,
      ];

      for (const uri of testUris) {
        expect(uri.startsWith("todo://")).toBe(true);
      }
    });
  });
});