import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  initializeProjectContext,
  getTodoById,
  saveTodo,
  saveTodoBatch,
  deleteTodo,
  deleteTodoBatch,
  moveTodosBatch,
  getTodosByListId,
  getCurrentProject,
  updateProject,
  getTodoListById,
  getAllTodoListsForCurrentProject,
  getCurrentDefaultTodoListId,
  createTodoList,
  updateTodoList,
  deleteTodoList,
} from "./database.js";

// --- Type Definitions ---
const TodoStatusSchema = z.enum(["completed", "pending", "in_progress"]);
const TodoPrioritySchema = z.enum(["high", "medium", "low"]);

// Export schemas for testing and validation
export { TodoStatusSchema, TodoPrioritySchema };

// --- Response Utilities ---

/**
 * Creates a standardized error response for MCP tools
 */
export function createErrorResponse(message: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
  };
}

/**
 * Creates a standardized success response for MCP tools
 */
export function createSuccessResponse(data: string | object) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

// --- Tool Handlers ---

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

    const savedTodo = await saveTodo({
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
      const todo = todos[i];
      if (typeof todo.id !== 'number') {
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
      results
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
      if (typeof id !== 'number') {
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
      results
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

    if (typeof target_todo_list_id !== 'number') {
      return createErrorResponse("Target todo list ID must be a valid number.");
    }

    // Validate each todo ID is a number
    for (let i = 0; i < todo_ids.length; i++) {
      const id = todo_ids[i];
      if (typeof id !== 'number') {
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
      results
    };

    return createSuccessResponse(`Batch move completed: ${successful} successful, ${failed} failed. Details: ${JSON.stringify(summary, null, 2)}`);
  } catch (error) {
    console.error("Error in TodoListMoveBatch handler:", error);
    return createErrorResponse(`Failed to move todos batch: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// --- Server Setup ---

/**
 * Create and configure the MCP server
 */
export function createTodoServer(): McpServer {
  const server = new McpServer({
    name: "todo-server",
    version: "1.0.0",
  }, {
    instructions: `# Todo List Management Server

A todo list management server: use the tools in this server to maintain task/todo lists for tracking progress against long and short-term plans.

## Tools

### Core Todo Management
- **todo-write**: Create new todos or update existing ones (supports PATCH operations). Use when adding tasks to your plan or updating task status/priority.
- **todo-read**: Retrieve a specific todo by ID. Use when you need details about a particular task.
- **todo-list**: List all todos sorted by priority (high → medium → low). Use to display current task status and plan overview.
- **todo-delete**: Remove a single todo. Use when a task is no longer relevant or was added by mistake.

### Batch Operations  
- **todo-write-batch**: Create or update multiple todos in a single transaction. Use when adding several related tasks or making bulk status updates.
- **todo-delete-batch**: Delete multiple todos at once. Use when cleaning up completed sprints or removing obsolete tasks.
- **todo-list-move-batch**: Move multiple todos between different lists. Use when reorganizing tasks across projects or categories.

### Project Management
- **project-get**: Get current project details (name, location, default todo list). Use to understand the current working context.
- **project-update**: Update project name or default todo list. Use when renaming projects or changing organizational structure.

### Todo List Organization
- **todo-list-list**: List all todo lists for the current project. Use to see available categories/lists for task organization.
- **todo-list-get**: Get details of a specific todo list or the default list. Use to understand list structure and statistics.
- **todo-list-create**: Create new todo lists for categorizing tasks. Use when starting new project phases or organizing by theme.
- **todo-list-update**: Update todo list name or description. Use when reorganizing or clarifying list purposes.
- **todo-list-delete**: Delete a todo list and all its todos. Use when project phases are complete or categories are no longer needed.

## Best Practices

### Display Format
When displaying todos to users, use these visual indicators:
- ✅ for completed tasks (\`status: "completed"\`)
- ⏳ for in-progress tasks (\`status: "in_progress"\`) 
- 🔲 for pending tasks (\`status: "pending"\`)

### Priority Visualization
Show priority using visual cues:
- 🔴 High priority tasks (tackle these first)
- 🟡 Medium priority tasks (standard workflow)
- 🟢 Low priority tasks (when time permits)

### Workflow Guidelines

**When starting a new project or plan:**
1. Use \`project-get\` to understand current context
2. Use \`todo-list-create\` to organize tasks by theme/phase if needed
3. Use \`todo-write-batch\` to add multiple planned tasks efficiently

**During active work:**
1. Use \`todo-list\` to see current priorities and status
2. Use \`todo-write\` to update task status as work progresses
3. Use \`todo-write\` to add new tasks discovered during implementation

**For project organization:**
1. Group related tasks using different todo lists (e.g., "Sprint 1", "Documentation", "Testing")
2. Use priority levels to indicate urgency within each list
3. Use batch operations when making systematic changes across multiple tasks

**For progress tracking:**
1. Regularly update task status to reflect actual progress
2. Use the visual indicators when presenting status to stakeholders
3. Use \`todo-list\` to generate progress reports sorted by priority`,
    capabilities: {
      tools: { listChanged: true },
      logging: {}
    }
  });

  // Tool to write or update a todo item
  server.tool(
    "todo-write",
    'Create a new todo item or update an existing one with PATCH support. For new todos, content is required. For updates, only specify the fields you want to change.\n\nExamples:\n• Create: {id: 1, content: "Fix bug", priority: "high"}\n• Update status only: {id: 1, status: "completed"}\n• Update multiple fields: {id: 1, status: "in_progress", priority: "high"}',
    {
      id: z.number().describe("The unique identifier for the todo item."),
      content: z
        .string()
        .optional()
        .describe(
          "The content or description of the todo item. Required for new todos, optional for updates.",
        ),
      priority: TodoPrioritySchema.optional().describe(
        "Priority level: 'high', 'medium', or 'low'. Defaults to 'medium'.",
      ),
      status: TodoStatusSchema.optional().describe(
        "Status: 'pending', 'in_progress', or 'completed'. Defaults to 'pending'.",
      ),
      todo_list_id: z
        .number()
        .optional()
        .describe(
          "The ID of the todo list. Defaults to the current project's default todo list.",
        ),
    },
    async ({ id, content, priority, status, todo_list_id }) => {
      return await handleTodoWrite({
        id,
        content,
        priority,
        status,
        todo_list_id,
      });
    },
  );

  // Tool to write or update multiple todo items in batch
  server.tool(
    "todo-write-batch",
    'Create or update multiple todo items in a single batch operation with transaction support. Each todo in the array supports PATCH semantics - for new todos, content is required; for updates, only specify the fields you want to change.\n\nExamples:\n• Create multiple: [{id: 1, content: "Task 1", priority: "high"}, {id: 2, content: "Task 2"}]\n• Update multiple: [{id: 1, status: "completed"}, {id: 2, priority: "low"}]\n• Mixed operations: [{id: 1, content: "New task"}, {id: 2, status: "completed"}]',
    {
      todos: z.array(z.object({
        id: z.number().describe("The unique identifier for the todo item."),
        content: z
          .string()
          .optional()
          .describe(
            "The content or description of the todo item. Required for new todos, optional for updates.",
          ),
        priority: TodoPrioritySchema.optional().describe(
          "Priority level: 'high', 'medium', or 'low'. Defaults to 'medium'.",
        ),
        status: TodoStatusSchema.optional().describe(
          "Status: 'pending', 'in_progress', or 'completed'. Defaults to 'pending'.",
        ),
        todo_list_id: z
          .number()
          .optional()
          .describe(
            "The ID of the todo list. Defaults to the current project's default todo list.",
          ),
      })).min(1).describe("Array of todo items to create or update. At least one todo is required."),
    },
    async ({ todos }) => {
      return await handleTodoWriteBatch({ todos });
    },
  );

  // Tool to read a specific todo item by its ID
  server.tool(
    "todo-read",
    'Retrieve a specific todo item by its ID. Returns the complete todo object with all fields (id, content, status, priority).\n\nExample:\n• Get todo: {id: 1}\n  Returns: {"id": 1, "content": "Fix bug", "status": "pending", "priority": "high"}',
    {
      id: z.number().describe("The ID of the todo item to retrieve."),
      todo_list_id: z
        .number()
        .optional()
        .describe(
          "The ID of the todo list to search in. Optional - the todo will be found regardless of which list it's in.",
        ),
    },
    async ({ id }) => {
      try {
        const todo = await getTodoById(id);
        if (todo) {
          return createSuccessResponse(todo);
        } else {
          return createErrorResponse(`Todo with ID ${id} not found.`);
        }
      } catch (error) {
        console.error("Error in TodoRead handler:", error);
        return createErrorResponse(`Failed to read todo ${id}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },
  );

  // Tool to list all todo items, ordered by priority
  server.tool(
    "todo-list",
    'List all todo items sorted by priority (high → medium → low). Returns an array of all todos with complete details.\n\nExample:\n• No parameters needed\n  Returns: {"todos": [{"id": 1, "content": "Fix bug", "status": "pending", "priority": "high"}, ...]}',
    {
      todo_list_id: z
        .number()
        .optional()
        .describe(
          "The ID of the todo list to retrieve todos from. Defaults to the current project's default todo list.",
        ),
    },
    async ({ todo_list_id }) => {
      try {
        const todos = await getTodosByListId(todo_list_id);
        return createSuccessResponse({ todos });
      } catch (error) {
        console.error("Error in TodoList handler:", error);
        return createErrorResponse(`Failed to list todos: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },
  );

  // Tool to delete a specific todo item
  server.tool(
    "todo-delete",
    'Delete a specific todo item by its ID. This permanently removes the todo from the database.\n\nExample:\n• Delete todo: {id: 1}\n  Returns: "Todo 1 deleted successfully."',
    {
      id: z.number().describe("The ID of the todo item to delete."),
    },
    async ({ id }) => {
      return await handleTodoDelete({ id });
    },
  );

  // Tool to delete multiple todo items in batch
  server.tool(
    "todo-delete-batch",
    'Delete multiple todo items by their IDs in a single batch operation with transaction support. This permanently removes the todos from the database.\n\nExamples:\n• Delete multiple: {todo_ids: [1, 2, 3]}\n• Delete single in batch: {todo_ids: [5]}\n  Returns batch operation results with success/failure count',
    {
      todo_ids: z.array(z.number()).min(1).describe("Array of todo item IDs to delete. At least one ID is required."),
    },
    async ({ todo_ids }) => {
      return await handleTodoDeleteBatch({ todo_ids });
    },
  );

  // Tool to move multiple todo items between lists in batch
  server.tool(
    "todo-list-move-batch",
    'Move multiple todo items to a different todo list in a single batch operation with transaction support. This updates the todo_list_id for all specified todos.\n\nExamples:\n• Move multiple: {todo_ids: [1, 2, 3], target_todo_list_id: 5}\n• Move single in batch: {todo_ids: [7], target_todo_list_id: 2}\n  Returns batch operation results with success/failure count',
    {
      todo_ids: z.array(z.number()).min(1).describe("Array of todo item IDs to move. At least one ID is required."),
      target_todo_list_id: z.number().describe("The ID of the target todo list to move the todos to."),
    },
    async ({ todo_ids, target_todo_list_id }) => {
      return await handleTodoListMoveBatch({ todo_ids, target_todo_list_id });
    },
  );

  // Tool to get current project details
  server.tool(
    "project-get",
    'Get the current project details including name, location, and default todo list.\n\nExample:\n• No parameters needed\n  Returns: {"id": 1, "name": "My Project", "location": "/path/to/project", "default_todo_list_id": 1}',
    {},
    async () => {
      try {
        const currentProject = await getCurrentProject();
        if (currentProject) {
          return createSuccessResponse(currentProject);
        } else {
          return createErrorResponse("No current project found.");
        }
      } catch (error) {
        console.error("Error in project-get handler:", error);
        return createErrorResponse(`Failed to get project: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },
  );

  // Tool to update current project
  server.tool(
    "project-update",
    'Update the current project\'s name or default todo list.\n\nExamples:\n• Update name: {name: "New Project Name"}\n• Update default todo list: {default_todo_list_id: 2}\n• Update both: {name: "New Name", default_todo_list_id: 2}',
    {
      name: z.string().optional().describe("The new name for the project."),
      default_todo_list_id: z
        .number()
        .optional()
        .describe("The ID of the todo list to set as default."),
    },
    async ({ name, default_todo_list_id }) => {
      try {
        const currentProject = await getCurrentProject();
        if (!currentProject) {
          return createErrorResponse("No current project found.");
        }

        if (!name && !default_todo_list_id) {
          return createErrorResponse("At least one field (name or default_todo_list_id) must be provided for updates.");
        }

        const updatedProject = await updateProject(currentProject.id, {
          name,
          default_todo_list_id,
        });

        return createSuccessResponse(`Project updated successfully: ${JSON.stringify(updatedProject, null, 2)}`);
      } catch (error) {
        console.error("Error in project-update handler:", error);
        return createErrorResponse(`Failed to update project: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },
  );

  // Tool to list all todo lists
  server.tool(
    "todo-list-list",
    'List all todo lists for the current project.\n\nExample:\n• No parameters needed\n  Returns: {"todo_lists": [{"id": 1, "name": "Default", "description": "...", "num_completed": 5, "total_count": 10}, ...]}',
    {},
    async () => {
      try {
        const todoLists = await getAllTodoListsForCurrentProject();
        return createSuccessResponse({ todo_lists: todoLists });
      } catch (error) {
        console.error("Error in todo_list-list handler:", error);
        return createErrorResponse(`Failed to list todo lists: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },
  );

  // Tool to get details of a specific todo list
  server.tool(
    "todo-list-get",
    "Get details of a specific todo list by ID, or get the default todo list if no ID provided.\n\nExamples:\n• Get specific list: {id: 1}\n• Get default list: {} (no parameters)",
    {
      id: z
        .number()
        .optional()
        .describe(
          "The ID of the todo list to retrieve. If not provided, returns the current project's default todo list.",
        ),
    },
    async ({ id }) => {
      try {
        let todoListId = id;

        // If no ID provided, try to get the default from memory or current project
        if (!todoListId) {
          todoListId = getCurrentDefaultTodoListId() ?? undefined;

          // If still no ID, try to get it from the current project
          if (!todoListId) {
            const currentProject = await getCurrentProject();
            if (currentProject?.default_todo_list_id) {
              todoListId = currentProject.default_todo_list_id;
            }
          }
        }

        if (!todoListId) {
          return createErrorResponse("No todo list ID provided and no default todo list available.");
        }

        const todoList = await getTodoListById(todoListId);

        if (todoList) {
          return createSuccessResponse(todoList);
        } else {
          return createErrorResponse(`Todo list with ID ${todoListId} not found.`);
        }
      } catch (error) {
        console.error("Error in todo_list-get handler:", error);
        return createErrorResponse(`Failed to get todo list: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },
  );

  // Tool to create a new todo list
  server.tool(
    "todo-list-create",
    'Create a new todo list for the current project.\n\nExamples:\n• Create with name only: {name: "Shopping List"}\n• Create with name and description: {name: "Work Tasks", description: "Tasks related to work project"}',
    {
      name: z.string().describe("The name of the new todo list."),
      description: z
        .string()
        .optional()
        .describe("An optional description for the todo list."),
    },
    async ({ name, description }) => {
      try {
        const newTodoList = await createTodoList(name, description);
        return createSuccessResponse(`Todo list created successfully: ${JSON.stringify(newTodoList, null, 2)}`);
      } catch (error) {
        console.error("Error in todo_list-create handler:", error);
        return createErrorResponse(`Failed to create todo list: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },
  );

  // Tool to update a todo list
  server.tool(
    "todo-list-update",
    'Update an existing todo list\'s name or description.\n\nExamples:\n• Update name only: {id: 1, name: "Updated List"}\n• Update description only: {id: 1, description: "New description"}\n• Update both: {id: 1, name: "New Name", description: "New description"}',
    {
      id: z.number().describe("The ID of the todo list to update."),
      name: z.string().optional().describe("The new name for the todo list."),
      description: z
        .string()
        .optional()
        .describe("The new description for the todo list."),
    },
    async ({ id, name, description }) => {
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
    },
  );

  // Tool to delete a todo list
  server.tool(
    "todo-list-delete",
    "Delete a todo list and all its todos. Cannot delete the default todo list for a project.\n\nExample:\n• Delete list: {id: 2}",
    {
      id: z.number().describe("The ID of the todo list to delete."),
    },
    async ({ id }) => {
      try {
        await deleteTodoList(id);
        return createSuccessResponse(`Todo list with ID ${id} deleted successfully.`);
      } catch (error) {
        console.error("Error in todo-list-delete handler:", error);
        return createErrorResponse(`Failed to delete todo list: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },
  );

  return server;
}

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
    "Available tools: todo-write, todo-write-batch, todo-read, todo-list, todo-delete, todo-delete-batch, todo-list-move-batch, project-get, project-update, todo-list-list, todo-list-get, todo-list-create, todo-list-update, todo-list-delete",
  );
}

// Start the server only if this is the main module
if (import.meta.main) {
  main().catch(console.error);
}
