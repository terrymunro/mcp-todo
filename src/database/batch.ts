import { type Todo } from "../schema.js";
import { getSqlite } from "./connection.js";
import { saveTodo, deleteTodo, getTodoById } from "./todo.js";
import { getTodoListById } from "./todo-list.js";

/**
 * Batch Database Operations
 * 
 * Handles transactional batch operations for todos
 */

/**
 * Save multiple todos in a single transaction
 * Returns an array of results indicating success/failure for each todo
 * 
 * @param todos - Array of todo data to save
 * @returns Promise resolving to array of operation results
 */
export async function saveTodoBatch(
  todos: Array<{
    id: number;
    content?: string;
    priority?: "high" | "medium" | "low";
    status?: "completed" | "pending" | "in_progress";
    todo_list_id?: number;
  }>,
): Promise<Array<{ id: number; success: boolean; todo?: Todo; error?: string }>> {
  const sqlite = await getSqlite();
  const results: Array<{ id: number; success: boolean; todo?: Todo; error?: string }> = [];
  
  try {
    sqlite.exec("BEGIN TRANSACTION");
    
    for (const todoData of todos) {
      try {
        const savedTodo = await saveTodo(todoData);
        results.push({
          id: todoData.id,
          success: true,
          todo: savedTodo,
        });
      } catch (error) {
        results.push({
          id: todoData.id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
  
  return results;
}

/**
 * Delete multiple todos in a single transaction
 * Returns an array of results indicating success/failure for each todo
 * 
 * @param todoIds - Array of todo IDs to delete
 * @returns Promise resolving to array of operation results
 */
export async function deleteTodoBatch(
  todoIds: number[],
): Promise<Array<{ id: number; success: boolean; error?: string }>> {
  const sqlite = await getSqlite();
  const results: Array<{ id: number; success: boolean; error?: string }> = [];
  
  try {
    sqlite.exec("BEGIN TRANSACTION");
    
    for (const id of todoIds) {
      try {
        await deleteTodo(id);
        results.push({
          id,
          success: true,
        });
      } catch (error) {
        results.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
  
  return results;
}

/**
 * Move multiple todos to a different todo list in a single transaction
 * Returns an array of results indicating success/failure for each todo
 * 
 * @param todoIds - Array of todo IDs to move
 * @param targetTodoListId - Target todo list ID
 * @returns Promise resolving to array of operation results
 * @throws Error if target todo list doesn't exist
 */
export async function moveTodosBatch(
  todoIds: number[],
  targetTodoListId: number,
): Promise<Array<{ id: number; success: boolean; error?: string }>> {
  const sqlite = await getSqlite();
  const results: Array<{ id: number; success: boolean; error?: string }> = [];
  
  // Validate target todo list exists before starting transaction
  const targetList = await getTodoListById(targetTodoListId);
  if (!targetList) {
    throw new Error(`Target todo list with ID ${targetTodoListId} not found`);
  }
  
  try {
    sqlite.exec("BEGIN TRANSACTION");
    
    for (const id of todoIds) {
      try {
        // Check if todo exists
        const existingTodo = await getTodoById(id);
        if (!existingTodo) {
          results.push({
            id,
            success: false,
            error: `Todo with ID ${id} not found`,
          });
          continue;
        }
        
        // Move the todo by updating its todo_list_id
        await saveTodo({
          id,
          todo_list_id: targetTodoListId,
        });
        
        results.push({
          id,
          success: true,
        });
      } catch (error) {
        results.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
  
  return results;
}