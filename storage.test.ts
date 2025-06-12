import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import * as path from "path";

// Mock fs/promises module before importing anything else
const mockFs = {
  files: new Map<string, string>(),
  directories: new Set<string>(["/", process.cwd()]),

  clear() {
    this.files.clear();
    this.directories.clear();
    this.directories.add("/");
    this.directories.add(process.cwd());
  },

  setFile(filePath: string, content: string) {
    const dir = path.dirname(filePath);
    this.directories.add(dir);
    this.files.set(filePath, content);
  },

  getFile(filePath: string) {
    return this.files.get(filePath);
  },

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    if (options?.recursive) {
      const parts = dirPath.split(path.sep);
      let currentPath = dirPath.startsWith('/') ? '/' : '';
      for (const part of parts) {
        if (part) {
          currentPath = currentPath === '/' ? `/${part}` : path.join(currentPath, part);
          this.directories.add(currentPath);
        }
      }
    } else {
      if (!this.directories.has(path.dirname(dirPath))) {
        throw new Error(`ENOENT: no such file or directory, mkdir '${dirPath}'`);
      }
      this.directories.add(dirPath);
    }
  },

  async writeFile(filePath: string, data: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!this.directories.has(dir)) {
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
    }
    this.files.set(filePath, data);
  },

  async readFile(filePath: string): Promise<string> {
    if (!this.files.has(filePath)) {
      const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as any;
      error.code = "ENOENT";
      throw error;
    }
    return this.files.get(filePath)!;
  },

  async readdir(dirPath: string): Promise<string[]> {
    if (!this.directories.has(dirPath)) {
      const error = new Error(`ENOENT: no such file or directory, scandir '${dirPath}'`) as any;
      error.code = "ENOENT";
      throw error;
    }

    const files: string[] = [];
    for (const [filePath] of this.files) {
      if (path.dirname(filePath) === dirPath) {
        files.push(path.basename(filePath));
      }
    }
    return files;
  }
};

mock.module("fs/promises", () => ({
  mkdir: mock(mockFs.mkdir.bind(mockFs)),
  writeFile: mock(mockFs.writeFile.bind(mockFs)),
  readFile: mock(mockFs.readFile.bind(mockFs)),
  readdir: mock(mockFs.readdir.bind(mockFs)),
}));

// Now import the module under test
import {
  ensureTodoDirectoryExists,
  writeTodoToFile,
  readTodoFromFile,
  readAllTodos,
  TODO_DIR,
  type Todo
} from "./index";

// Test helpers
const createMockTodo = (id: number, overrides: Partial<any> = {}) => ({
  id,
  content: `Test todo ${id}`,
  status: "pending" as const,
  priority: "medium" as const,
  ...overrides,
});

const getTestTodoPath = (id: number) => path.join(TODO_DIR, `${id}.json`);

// Global console suppression for cleaner test output
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
};

beforeEach(() => {
  // Suppress console output during tests
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
});

afterEach(() => {
  // Restore console output after each test
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
});

describe("Storage Functions", () => {
  beforeEach(() => {
    mockFs.clear();
  });

  describe("ensureTodoDirectoryExists", () => {
    test("should create todo directory if it doesn't exist", async () => {
      await ensureTodoDirectoryExists();

      expect(mockFs.files.size).toBe(0);
      // The directory should be created but no files yet
      expect(mockFs.directories.has(TODO_DIR)).toBe(true);
    });

    test("should not fail if directory already exists", async () => {
      // Create directory first
      await mockFs.mkdir(TODO_DIR, { recursive: true });

      // Should not throw when called again
      await expect(ensureTodoDirectoryExists()).resolves.toBeUndefined();
    });

    test("should create parent directories recursively", async () => {
      await ensureTodoDirectoryExists();

      // Check that all parent directories were created
      const parts = TODO_DIR.split(path.sep);
      let currentPath = TODO_DIR.startsWith('/') ? '/' : '';
      for (const part of parts) {
        if (part) {
          currentPath = currentPath === '/' ? `/${part}` : path.join(currentPath, part);
          expect(mockFs.directories.has(currentPath)).toBe(true);
        }
      }
    });
  });

  describe("writeTodoToFile", () => {
    beforeEach(async () => {
      await mockFs.mkdir(TODO_DIR, { recursive: true });
    });

    test("should write a todo to file successfully", async () => {
      const todo = createMockTodo(1, { content: "Test todo", priority: "high" });

      await writeTodoToFile(todo);

      const filePath = getTestTodoPath(1);
      expect(mockFs.files.has(filePath)).toBe(true);

      const fileContent = mockFs.files.get(filePath);
      const parsedTodo = JSON.parse(fileContent!);
      expect(parsedTodo).toEqual(todo);
    });

    test("should overwrite existing todo file", async () => {
      const todo1 = createMockTodo(1, { content: "Original content" });
      const todo2 = createMockTodo(1, { content: "Updated content" });

      await writeTodoToFile(todo1);
      await writeTodoToFile(todo2);

      const filePath = getTestTodoPath(1);
      const fileContent = mockFs.files.get(filePath);
      const parsedTodo = JSON.parse(fileContent!);
      expect(parsedTodo.content).toBe("Updated content");
    });

    test("should format JSON with proper indentation", async () => {
      const todo = createMockTodo(1);

      await writeTodoToFile(todo);

      const filePath = getTestTodoPath(1);
      const fileContent = mockFs.getFile(filePath);
      expect(fileContent).toBe(JSON.stringify(todo, null, 2));
    });

    test("should throw error if directory doesn't exist", async () => {
      // Clear directories to simulate non-existent directory
      mockFs.clear();
      const todo = createMockTodo(1);

      await expect(writeTodoToFile(todo)).rejects.toThrow("ENOENT");
    });
  });

  describe("readTodoFromFile", () => {
    beforeEach(async () => {
      await mockFs.mkdir(TODO_DIR, { recursive: true });
    });

    test("should read existing todo file successfully", async () => {
      const todo = createMockTodo(1, { content: "Test content", priority: "low" });
      const filePath = getTestTodoPath(1);
      mockFs.setFile(filePath, JSON.stringify(todo, null, 2));

      const result = await readTodoFromFile(1);

      expect(result).toEqual(todo);
    });

    test("should return null for non-existent file", async () => {
      const result = await readTodoFromFile(999);

      expect(result).toBe(null);
    });

    test("should validate todo data against schema", async () => {
      const invalidTodo = { id: "not-a-number", content: "test" }; // id should be number
      const filePath = getTestTodoPath(1);
      mockFs.setFile(filePath, JSON.stringify(invalidTodo));

      await expect(readTodoFromFile(1)).rejects.toThrow();
    });

    test("should handle corrupted JSON file", async () => {
      const filePath = getTestTodoPath(1);
      mockFs.setFile(filePath, "invalid json {");

      await expect(readTodoFromFile(1)).rejects.toThrow();
    });

    test("should handle different todo statuses and priorities", async () => {
      const statuses = ["pending", "in_progress", "completed"] as const;
      const priorities = ["low", "medium", "high"] as const;

      for (let i = 0; i < statuses.length; i++) {
        for (let j = 0; j < priorities.length; j++) {
          const id = i * 3 + j + 1;
          const todo = createMockTodo(id, {
            status: statuses[i],
            priority: priorities[j]
          });
          const filePath = getTestTodoPath(id);
          mockFs.setFile(filePath, JSON.stringify(todo, null, 2));

          const result = await readTodoFromFile(id);
          expect(result).toEqual(todo);
        }
      }
    });
  });

  describe("readAllTodos", () => {
    beforeEach(async () => {
      await mockFs.mkdir(TODO_DIR, { recursive: true });
    });

    test("should return empty array when no todos exist", async () => {
      const result = await readAllTodos();

      expect(result).toEqual([]);
    });

    test("should return empty array when directory doesn't exist", async () => {
      // Clear the mock to simulate non-existent directory
      mockFs.clear();

      const result = await readAllTodos();

      expect(result).toEqual([]);
    });

    test("should read all todo files successfully", async () => {
      const todos = [
        createMockTodo(1, { content: "First todo", priority: "high" }),
        createMockTodo(2, { content: "Second todo", priority: "medium" }),
        createMockTodo(3, { content: "Third todo", priority: "low" })
      ];

      for (const todo of todos) {
        const filePath = getTestTodoPath(todo.id);
        mockFs.setFile(filePath, JSON.stringify(todo, null, 2));
      }

      const result = await readAllTodos();

      expect(result).toHaveLength(3);
      expect(result).toEqual(expect.arrayContaining(todos));
    });

    test("should ignore non-JSON files", async () => {
      const todo = createMockTodo(1);
      const filePath = getTestTodoPath(1);
      mockFs.setFile(filePath, JSON.stringify(todo, null, 2));

      // Add non-JSON files
      mockFs.setFile(path.join(TODO_DIR, "readme.txt"), "Some text");
      mockFs.setFile(path.join(TODO_DIR, "config.ini"), "[config]");

      const result = await readAllTodos();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(todo);
    });

    test("should ignore files with non-numeric names", async () => {
      const todo = createMockTodo(1);
      const filePath = getTestTodoPath(1);
      mockFs.setFile(filePath, JSON.stringify(todo, null, 2));

      // Add files with non-numeric names
      mockFs.setFile(path.join(TODO_DIR, "abc.json"), JSON.stringify({ test: true }));
      mockFs.setFile(path.join(TODO_DIR, "backup-123.json"), JSON.stringify({ backup: true }));

      const result = await readAllTodos();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(todo);
    });

    test("should filter out corrupted files gracefully", async () => {
      const validTodo = createMockTodo(1);
      const validFilePath = getTestTodoPath(1);
      mockFs.setFile(validFilePath, JSON.stringify(validTodo, null, 2));

      // Add corrupted file
      const corruptedFilePath = getTestTodoPath(2);
      mockFs.setFile(corruptedFilePath, "invalid json {");

      const result = await readAllTodos();

      // Should only return the valid todo
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(validTodo);
    });

    test("should handle large number of todos", async () => {
      const todoCount = 100;
      const todos: Todo[] = [];

      for (let i = 1; i <= todoCount; i++) {
        const todo = createMockTodo(i, { content: `Todo ${i}` });
        todos.push(todo);
        const filePath = getTestTodoPath(i);
        mockFs.setFile(filePath, JSON.stringify(todo, null, 2));
      }

      const result = await readAllTodos();

      expect(result).toHaveLength(todoCount);
      expect(result).toEqual(expect.arrayContaining(todos));
    });
  });
});
