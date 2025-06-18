import { getTodoById, saveTodo, deleteTodo } from "../database/todo.js";
import { saveTodoBatch, deleteTodoBatch, moveTodosBatch } from "../database/batch.js";
import { createErrorResponse, createSuccessResponse } from "../utils/response.js";

/**
 * Todo Handler Functions
 * 
 * Extracted from src/index.ts for better organization
 * Handles all todo-related MCP tool operations
 */

/**
 * Handle todo write operations with patching support
 */
export async function handleTodoWrite({
  id,
  content,
  priority,
  status,
  todo_list_id,
}: {
  id: number;
  content?: string;
  priority?: "high" | "medium" | "low";
  status?: "completed" | "pending" | "in_progress";
  todo_list_id?: number;
}) {
  try {
    // Check if the item already exists to preserve its fields if not provided
    const existingTodo = await getTodoById(id);

    // For new todos, content is required
    if (!existingTodo && !content) {
      return createErrorResponse("Content is required when creating a new todo.");
    }

    // For updates, at least one field must be provided
    if (existingTodo && !content && !priority && !status && !todo_list_id) {
      return createErrorResponse("At least one field (content, priority, status, or todo_list_id) must be provided for updates.");
    }

    await saveTodo({
      id,
      content,
      priority,
      status,
      todo_list_id,
    });

    return createSuccessResponse(`Todo ${id} saved successfully.`);
  } catch (error) {
    console.error("Error in TodoWrite handler:", error);
    return createErrorResponse(`Failed to write todo: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Handle batch todo write operations
 */
export async function handleTodoWriteBatch({
  todos,
}: {
  todos: Array<{
    id: number;
    content?: string;
    priority?: "high" | "medium" | "low";
    status?: "completed" | "pending" | "in_progress";
    todo_list_id?: number;
  }>;
}) {
  try {
    if (!todos || todos.length === 0) {
      return createErrorResponse("At least one todo must be provided.");
    }

    // Validate each todo has a valid ID
    for (let i = 0; i < todos.length; i++) {
      const todoItem = todos[i];
      if (!todoItem || typeof todoItem.id !== "number") {
        return createErrorResponse(`Todo at index ${i} must have a valid ID.`);
      }
    }

    const results = await saveTodoBatch(todos);

    // Count successes and failures
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    const summary = {
      total: results.length,
      successful,
      failed,
      results,
    };

    return createSuccessResponse(`Batch write completed: ${successful} successful, ${failed} failed. Details: ${JSON.stringify(summary, null, 2)}`);
  } catch (error) {
    console.error("Error in TodoWriteBatch handler:", error);
    return createErrorResponse(`Failed to write todos batch: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Handle todo delete operations
 */
export async function handleTodoDelete({ id }: { id: number }) {
  try {
    await deleteTodo(id);
    return createSuccessResponse(`Todo ${id} deleted successfully.`);
  } catch (error) {
    console.error("Error in TodoDelete handler:", error);
    return createErrorResponse(`Failed to delete todo: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Handle batch todo delete operations
 */
export async function handleTodoDeleteBatch({
  todo_ids,
}: {
  todo_ids: number[];
}) {
  try {
    if (!todo_ids || todo_ids.length === 0) {
      return createErrorResponse("At least one todo ID must be provided.");
    }

    // Validate each todo ID is a number
    for (let i = 0; i < todo_ids.length; i++) {
      const id = todo_ids[i];
      if (typeof id !== "number") {
        return createErrorResponse(`Todo ID at index ${i} must be a valid number.`);
      }
    }

    const results = await deleteTodoBatch(todo_ids);

    // Count successes and failures
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    const summary = {
      total: results.length,
      successful,
      failed,
      results,
    };

    return createSuccessResponse(`Batch delete completed: ${successful} successful, ${failed} failed. Details: ${JSON.stringify(summary, null, 2)}`);
  } catch (error) {
    console.error("Error in TodoDeleteBatch handler:", error);
    return createErrorResponse(`Failed to delete todos batch: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Handle batch todo list move operations
 */
export async function handleTodoListMoveBatch({
  todo_ids,
  target_todo_list_id,
}: {
  todo_ids: number[];
  target_todo_list_id: number;
}) {
  try {
    if (!todo_ids || todo_ids.length === 0) {
      return createErrorResponse("At least one todo ID must be provided.");
    }

    if (typeof target_todo_list_id !== "number") {
      return createErrorResponse("Target todo list ID must be a valid number.");
    }

    // Validate each todo ID is a number
    for (let i = 0; i < todo_ids.length; i++) {
      const id = todo_ids[i];
      if (typeof id !== "number") {
        return createErrorResponse(`Todo ID at index ${i} must be a valid number.`);
      }
    }

    const results = await moveTodosBatch(todo_ids, target_todo_list_id);

    // Count successes and failures
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    const summary = {
      total: results.length,
      successful,
      failed,
      target_todo_list_id,
      results,
    };

    return createSuccessResponse(`Batch move completed: ${successful} successful, ${failed} failed. Details: ${JSON.stringify(summary, null, 2)}`);
  } catch (error) {
    console.error("Error in TodoListMoveBatch handler:", error);
    return createErrorResponse(`Failed to move todos batch: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

