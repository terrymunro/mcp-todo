import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initializeProjectContext } from "./database/project.js";
import { createTodoServer } from "./server/setup.js";

// Export schemas for testing and validation
export { TodoStatusSchema, TodoPrioritySchema } from "./types/schemas.js";

// Export response utilities for testing and external use
export { createErrorResponse, createSuccessResponse } from "./utils/response.js";

// Export handlers for testing and external use
export {
  handleTodoWrite,
  handleTodoWriteBatch,
  handleTodoDelete,
  handleTodoDeleteBatch,
  handleTodoListMoveBatch,
} from "./handlers/todo.js";
export {
  handleProjectUpdate,
} from "./handlers/project.js";
export {
  handleTodoListCreate,
  handleTodoListUpdate,
  handleTodoListDelete,
} from "./handlers/todo-list.js";
export {
  listResources,
  readResource,
  RESOURCE_URIS,
} from "./handlers/resources.js";

// Export server creation function for testing and external use
export { createTodoServer } from "./server/setup.js";

/**
 * Main function to initialize and start the MCP server.
 */
export async function main() {
  // Initialize the database and project context
  await initializeProjectContext();

  const server = createTodoServer();
  const transport = new StdioServerTransport();

  console.log("Starting MCP Todo Server...");
  await server.connect(transport);

  console.log("MCP Todo Server is running.");
  console.log(
    `Available tools:
- todo-write - Create/update todo items
- todo-write-batch - Create/update multiple todos
- todo-delete - Delete a todo item
- todo-delete-batch - Delete multiple todos
- todo-list-move-batch - Move todos between lists
- project-update - Update project settings
- todo-list-create - Create new todo lists
- todo-list-update - Update todo list details
- todo-list-delete - Delete todo lists

Available resources (for reading data efficiently):
- todo://project/current - Current project details
- todo://todos/all - All todos from default list
- todo://lists/all - All todo lists for current project
- todo://list/default - Default todo list details
- todo://todo/{id} - Individual todo by ID
- todo://todos/list/{id} - Todos in specific list
- todo://list/{id} - Specific todo list details

ℹ️  Use resources for reading data, tools for modifications.`,
  );
}

// Start the server only if this is the main module
if (import.meta.main) {
  main().catch(console.error);
}
