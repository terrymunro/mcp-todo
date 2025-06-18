import { 
  createTodoList, 
  updateTodoList, 
  deleteTodoList, 
} from "../database/todo-list.js";
import { createErrorResponse, createSuccessResponse } from "../utils/response.js";

/**
 * Todo List Handler Functions
 * 
 * Extracted from src/index.ts for better organization
 * Handles all todo-list-related MCP tool operations
 */



/**
 * Handle todo list creation operations
 */
export async function handleTodoListCreate({
  name,
  description,
}: {
  name: string;
  description?: string;
}) {
  try {
    const newTodoList = await createTodoList(name, description);
    return createSuccessResponse(`Todo list created successfully: ${JSON.stringify(newTodoList, null, 2)}`);
  } catch (error) {
    console.error("Error in todo_list-create handler:", error);
    return createErrorResponse(`Failed to create todo list: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Handle todo list update operations
 */
export async function handleTodoListUpdate({
  id,
  name,
  description,
}: {
  id: number;
  name?: string;
  description?: string;
}) {
  try {
    if (!name && !description) {
      return createErrorResponse("At least one field (name or description) must be provided for updates.");
    }

    const updatedTodoList = await updateTodoList(id, { name, description });
    return createSuccessResponse(`Todo list updated successfully: ${JSON.stringify(updatedTodoList, null, 2)}`);
  } catch (error) {
    console.error("Error in todo-list-update handler:", error);
    return createErrorResponse(`Failed to update todo list: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Handle todo list delete operations
 */
export async function handleTodoListDelete({ id }: { id: number }) {
  try {
    await deleteTodoList(id);
    return createSuccessResponse(`Todo list with ID ${id} deleted successfully.`);
  } catch (error) {
    console.error("Error in todo-list-delete handler:", error);
    return createErrorResponse(`Failed to delete todo list: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}