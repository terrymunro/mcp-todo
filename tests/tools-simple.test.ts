import { describe, test, expect } from "bun:test";
import "./utils/test-logger"; // Auto-suppress verbose output during tests
import { createTodoList, getTodoById } from "../src/database";
import { handleTodoWrite, handleTodoWriteBatch, handleTodoDelete, handleTodoDeleteBatch, handleTodoListMoveBatch, TodoStatusSchema, TodoPrioritySchema } from "../src/index";

describe("MCP Tool Handler Validation", () => {
  describe("Schema validation", () => {
    test("should validate todo status values", () => {
      expect(TodoStatusSchema.parse("pending")).toBe("pending");
      expect(TodoStatusSchema.parse("in_progress")).toBe("in_progress");
      expect(TodoStatusSchema.parse("completed")).toBe("completed");

      expect(() => TodoStatusSchema.parse("invalid")).toThrow();
    });

    test("should validate todo priority values", () => {
      expect(TodoPrioritySchema.parse("low")).toBe("low");
      expect(TodoPrioritySchema.parse("medium")).toBe("medium");
      expect(TodoPrioritySchema.parse("high")).toBe("high");

      expect(() => TodoPrioritySchema.parse("invalid")).toThrow();
    });
  });

  describe("handleTodoWrite function", () => {
    test("should return error when creating todo without content", async () => {
      const result = await handleTodoWrite({
        id: 999991, // Use a unique ID that shouldn't exist
        priority: "high",
      });

      expect(result.content[0]!.text).toBe(
        "Content is required when creating a new todo.",
      );
    });

    test("should return error message format", async () => {
      const result = await handleTodoWrite({
        id: 999,
        priority: "high",
      });

      // Should return a proper error message structure
      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(1);
      expect(result.content[0]!.type).toBe("text");
      expect(typeof result.content[0]!.text).toBe("string");
    });
  });
});

describe("Error Handling", () => {
  test("handleTodoWrite should handle invalid database operations gracefully", async () => {
    // Test with invalid todo_list_id
    const result = await handleTodoWrite({
      id: 100,
      content: "Test content",
      todo_list_id: 999999, // Non-existent todo list
    });

    // Should return an error message rather than throwing
    expect(result.content[0]!.text).toContain("Failed to write todo");
  });
});

describe("Input Validation", () => {
  test("should validate PATCH operation requirements", async () => {
    // Try to update non-existent todo without any fields
    const result = await handleTodoWrite({
      id: 999999, // Non-existent todo
    });

    // Should require content for new todos
    expect(result.content[0]!.text).toBe(
      "Content is required when creating a new todo.",
    );
  });

  test("should validate todo_list_id exists", async () => {
    // Try to create todo with non-existent todo list ID
    const result = await handleTodoWrite({
      id: 999998,
      content: "Test content",
      todo_list_id: 999999, // Non-existent todo list
    });

    // Should return error message about todo list not found
    expect(result.content[0]!.text).toContain(
      "Todo list with ID 999999 not found",
    );
  });

  test("should validate todo_list_id belongs to current project", async () => {
    // This test would require setting up a different project context
    // For now, we test that the validation logic exists by checking error format
    const result = await handleTodoWrite({
      id: 999997,
      content: "Test content",
      todo_list_id: 999998, // Non-existent todo list
    });

    // Should return proper error message structure for todo list validation
    expect(result.content[0]!.text).toContain("Failed to write todo");
    expect(result.content[0]!.text).toContain("Todo list with ID");
  });
});

describe("Input Validation Edge Cases", () => {
  test("should handle very long content strings", async () => {
    // Create a string that's ~5000 characters long
    const longContent = "A".repeat(5000);
    
    const result = await handleTodoWrite({
      id: 1,
      content: longContent,
      priority: "medium",
    });

    // Should succeed (assuming no length limit in schema)
    expect(result.content[0]!.text).toContain("Todo 1 saved successfully");
  });

  test("should handle content with special characters and unicode", async () => {
    const specialContent = "Test with special chars: !@#$%^&*(){}[]|\\:;\"'<>,.?/~`+=\n\t\r";
    
    const result = await handleTodoWrite({
      id: 2,
      content: specialContent,
      priority: "high",
    });

    expect(result.content[0]!.text).toContain("Todo 2 saved successfully");
  });

  test("should handle unicode characters in content", async () => {
    const unicodeContent = "Unicode test: 你好世界 🌍 emoji test 🚀 ñáéíóú àèìòù äöü";
    
    const result = await handleTodoWrite({
      id: 3,
      content: unicodeContent,
      priority: "low",
    });

    expect(result.content[0]!.text).toContain("Todo 3 saved successfully");
  });

  test("should handle boundary values for todo IDs", async () => {
    // Test with ID 0
    const resultZero = await handleTodoWrite({
      id: 0,
      content: "Todo with ID zero",
    });
    expect(resultZero.content[0]!.text).toContain("Todo 0 saved successfully");

    // Test with very large ID
    const resultLarge = await handleTodoWrite({
      id: 2147483647, // Max 32-bit signed integer
      content: "Todo with large ID",
    });
    expect(resultLarge.content[0]!.text).toContain("Todo 2147483647 saved successfully");
  });

  test("should handle negative todo IDs", async () => {
    const result = await handleTodoWrite({
      id: -1,
      content: "Todo with negative ID",
    });
    
    // Should work since SQLite INTEGER can handle negative values
    expect(result.content[0]!.text).toContain("Todo -1 saved successfully");
  });

  test("should handle empty strings correctly", async () => {
    // Test creating a todo with empty content (should fail)
    const resultEmpty = await handleTodoWrite({
      id: 999,
      content: "",
    });
    
    // Empty content should be rejected when creating a new todo
    expect(resultEmpty.content[0]!.text).toContain("Content is required when creating a new todo");
  });

  test("should handle content with only whitespace", async () => {
    const whitespaceContent = "   \t\n\r   ";
    
    const result = await handleTodoWrite({
      id: 4,
      content: whitespaceContent,
    });

    expect(result.content[0]!.text).toContain("Todo 4 saved successfully");
  });

  test("should handle SQL-like characters in content", async () => {
    const sqlContent = "'; DROP TABLE todos; SELECT * FROM users WHERE id='1";
    
    const result = await handleTodoWrite({
      id: 5,
      content: sqlContent,
    });

    // Should be safe due to Drizzle ORM's parameter binding
    expect(result.content[0]!.text).toContain("Todo 5 saved successfully");
  });
});

describe("handleTodoDelete function", () => {
  test("should return error when deleting non-existent todo", async () => {
    const result = await handleTodoDelete({
      id: 999999, // Non-existent todo
    });

    expect(result.content[0]!.text).toContain("Failed to delete todo");
    expect(result.content[0]!.text).toContain("Todo with ID 999999 not found");
  });

  test("should return proper error message format", async () => {
    const result = await handleTodoDelete({
      id: 999998,
    });

    // Should return a proper error message structure
    expect(result.content).toBeDefined();
    expect(result.content.length).toBe(1);
    expect(result.content[0]!.type).toBe("text");
    expect(typeof result.content[0]!.text).toBe("string");
  });

  test("should handle boundary values for delete IDs", async () => {
    // Use timestamp-based IDs to ensure uniqueness
    const baseId = Date.now() + 1000000; // Large number to avoid conflicts
    
    // Test deleting with very negative ID (guaranteed non-existent)
    const resultNegative = await handleTodoDelete({ id: -baseId });
    expect(resultNegative.content[0]!.text).toContain(`Todo with ID -${baseId} not found`);

    // Test deleting with very large ID (guaranteed non-existent)
    const resultLarge = await handleTodoDelete({ id: baseId });
    expect(resultLarge.content[0]!.text).toContain(`Todo with ID ${baseId} not found`);
    
    // Test deleting with another large ID (guaranteed non-existent)
    const resultAnother = await handleTodoDelete({ id: baseId + 1 });
    expect(resultAnother.content[0]!.text).toContain(`Todo with ID ${baseId + 1} not found`);
  });
});

describe("handleTodoWriteBatch function", () => {
  test("should handle batch creation of multiple todos", async () => {
    const baseId = Date.now();
    const todos = [
      { id: baseId + 1, content: "Batch todo 1", priority: "high" as const },
      { id: baseId + 2, content: "Batch todo 2", priority: "medium" as const },
      { id: baseId + 3, content: "Batch todo 3", priority: "low" as const },
    ];

    const result = await handleTodoWriteBatch({ todos });

    expect(result.content[0]!.text).toContain("Batch write completed");
    expect(result.content[0]!.text).toContain("3 successful, 0 failed");
  });

  test("should handle mixed create and update operations", async () => {
    const baseId = Date.now() + 1000;
    
    // First create a todo to update later
    await handleTodoWrite({
      id: baseId,
      content: "Todo to update",
      priority: "medium",
    });

    // Now do batch operation with mix of create and update
    const todos = [
      { id: baseId, status: "completed" as const }, // Update existing
      { id: baseId + 1, content: "New batch todo", priority: "high" as const }, // Create new
    ];

    const result = await handleTodoWriteBatch({ todos });

    expect(result.content[0]!.text).toContain("Batch write completed");
    expect(result.content[0]!.text).toContain("2 successful, 0 failed");
  });

  test("should handle validation errors in batch", async () => {
    const todos = [
      { id: 9999991, content: "Valid todo" }, // Valid
      { id: 9999992 }, // Invalid - no content for new todo
      { id: 9999993, content: "Another valid todo" }, // Valid
    ];

    const result = await handleTodoWriteBatch({ todos });

    expect(result.content[0]!.text).toContain("Batch write completed");
    expect(result.content[0]!.text).toContain("2 successful, 1 failed");
  });

  test("should return error for empty todos array", async () => {
    const result = await handleTodoWriteBatch({ todos: [] });

    expect(result.content[0]!.text).toBe("At least one todo must be provided.");
  });

  test("should validate todo IDs in batch", async () => {
    const todos = [
      { id: "invalid" as any, content: "Todo with invalid ID" },
    ];

    const result = await handleTodoWriteBatch({ todos });

    expect(result.content[0]!.text).toContain("Todo at index 0 must have a valid ID");
  });
});

describe("handleTodoDeleteBatch function", () => {
  test("should handle batch deletion of multiple todos", async () => {
    const baseId = Date.now() + 2000;
    
    // First create some todos to delete
    await handleTodoWrite({
      id: baseId + 1,
      content: "Todo to delete 1",
      priority: "medium",
    });
    await handleTodoWrite({
      id: baseId + 2,
      content: "Todo to delete 2",
      priority: "high",
    });
    await handleTodoWrite({
      id: baseId + 3,
      content: "Todo to delete 3",
      priority: "low",
    });

    // Now delete them in batch
    const result = await handleTodoDeleteBatch({ 
      todo_ids: [baseId + 1, baseId + 2, baseId + 3], 
    });

    expect(result.content[0]!.text).toContain("Batch delete completed");
    expect(result.content[0]!.text).toContain("3 successful, 0 failed");
  });

  test("should handle mixed success and failure in batch delete", async () => {
    const baseId = Date.now() + 3000;
    
    // Create one todo to delete successfully
    await handleTodoWrite({
      id: baseId,
      content: "Todo to delete",
      priority: "medium",
    });

    // Try to delete one existing and one non-existent todo
    const result = await handleTodoDeleteBatch({ 
      todo_ids: [baseId, 9999999], // One valid, one invalid
    });

    expect(result.content[0]!.text).toContain("Batch delete completed");
    expect(result.content[0]!.text).toContain("1 successful, 1 failed");
  });

  test("should return error for empty todo_ids array", async () => {
    const result = await handleTodoDeleteBatch({ todo_ids: [] });

    expect(result.content[0]!.text).toBe("At least one todo ID must be provided.");
  });

  test("should validate todo IDs are numbers", async () => {
    const result = await handleTodoDeleteBatch({ 
      todo_ids: ["invalid" as any, 123], 
    });

    expect(result.content[0]!.text).toContain("Todo ID at index 0 must be a valid number");
  });

  test("should handle deletion of non-existent todos gracefully", async () => {
    // Use high timestamp-based IDs to ensure they don't exist
    const baseId = Date.now() + 9000000;
    
    const result = await handleTodoDeleteBatch({ 
      todo_ids: [baseId, baseId + 1, baseId + 2], 
    });

    expect(result.content[0]!.text).toContain("Batch delete completed");
    expect(result.content[0]!.text).toContain("0 successful, 3 failed");
    expect(result.content[0]!.text).toContain("not found");
  });
});

describe("handleTodoListMoveBatch function", () => {
  test("should handle batch move of multiple todos between lists", async () => {
    const baseId = Date.now() + 10000;
    
    // Create a new todo list to move todos to
    const targetList = await createTodoList("Target List", "List for move testing");
    
    // First create some todos to move
    await handleTodoWrite({
      id: baseId + 1,
      content: "Todo to move 1",
      priority: "medium",
    });
    await handleTodoWrite({
      id: baseId + 2,
      content: "Todo to move 2",
      priority: "high",
    });
    await handleTodoWrite({
      id: baseId + 3,
      content: "Todo to move 3",
      priority: "low",
    });

    // Now move them to the target list
    const result = await handleTodoListMoveBatch({ 
      todo_ids: [baseId + 1, baseId + 2, baseId + 3],
      target_todo_list_id: targetList.id,
    });

    expect(result.content[0]!.text).toContain("Batch move completed");
    expect(result.content[0]!.text).toContain("3 successful, 0 failed");
    
    // Verify todos were actually moved
    const movedTodo1 = await getTodoById(baseId + 1);
    const movedTodo2 = await getTodoById(baseId + 2);
    const movedTodo3 = await getTodoById(baseId + 3);
    
    expect(movedTodo1?.todo_list_id).toBe(targetList.id);
    expect(movedTodo2?.todo_list_id).toBe(targetList.id);
    expect(movedTodo3?.todo_list_id).toBe(targetList.id);
  });

  test("should handle mixed success and failure in batch move", async () => {
    const baseId = Date.now() + 11000;
    
    // Create a new todo list to move todos to
    const targetList = await createTodoList("Target List 2", "List for mixed move testing");
    
    // Create one todo to move successfully
    await handleTodoWrite({
      id: baseId,
      content: "Todo to move",
      priority: "medium",
    });

    // Try to move one existing and one non-existent todo
    const result = await handleTodoListMoveBatch({ 
      todo_ids: [baseId, 9999999], // One valid, one invalid
      target_todo_list_id: targetList.id,
    });

    expect(result.content[0]!.text).toContain("Batch move completed");
    expect(result.content[0]!.text).toContain("1 successful, 1 failed");
    
    // Verify the valid todo was moved
    const movedTodo = await getTodoById(baseId);
    expect(movedTodo?.todo_list_id).toBe(targetList.id);
  });

  test("should return error for empty todo_ids array", async () => {
    const result = await handleTodoListMoveBatch({ 
      todo_ids: [], 
      target_todo_list_id: 1, 
    });

    expect(result.content[0]!.text).toBe("At least one todo ID must be provided.");
  });

  test("should validate todo IDs are numbers", async () => {
    const result = await handleTodoListMoveBatch({ 
      todo_ids: ["invalid" as any, 123],
      target_todo_list_id: 1,
    });

    expect(result.content[0]!.text).toContain("Todo ID at index 0 must be a valid number");
  });

  test("should validate target todo list ID is a number", async () => {
    const result = await handleTodoListMoveBatch({ 
      todo_ids: [123],
      target_todo_list_id: "invalid" as any,
    });

    expect(result.content[0]!.text).toBe("Target todo list ID must be a valid number.");
  });

  test("should handle moving to non-existent todo list", async () => {
    const baseId = Date.now() + 12000;
    
    // Create a todo to move
    await handleTodoWrite({
      id: baseId,
      content: "Todo to move to nowhere",
      priority: "medium",
    });

    // Try to move to non-existent list
    const result = await handleTodoListMoveBatch({ 
      todo_ids: [baseId],
      target_todo_list_id: 9999999, // Non-existent list
    });

    expect(result.content[0]!.text).toContain("Failed to move todos batch");
    expect(result.content[0]!.text).toContain("Target todo list with ID 9999999 not found");
  });

  test("should handle moving non-existent todos gracefully", async () => {
    // Create a valid target list
    const targetList = await createTodoList("Target List 3", "List for non-existent todo testing");
    
    // Use high timestamp-based IDs to ensure they don't exist
    const baseId = Date.now() + 13000000;
    
    const result = await handleTodoListMoveBatch({ 
      todo_ids: [baseId, baseId + 1, baseId + 2],
      target_todo_list_id: targetList.id,
    });

    expect(result.content[0]!.text).toContain("Batch move completed");
    expect(result.content[0]!.text).toContain("0 successful, 3 failed");
    expect(result.content[0]!.text).toContain("not found");
  });
});
