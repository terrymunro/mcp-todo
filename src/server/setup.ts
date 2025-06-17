import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { 
  TodoStatusSchema, 
  TodoPrioritySchema, 
} from "../types/schemas.js";
import { 
  handleTodoWrite, 
  handleTodoWriteBatch, 
  handleTodoRead, 
  handleTodoDelete, 
  handleTodoDeleteBatch, 
  handleTodoListMoveBatch, 
} from "../handlers/todo.js";
import { 
  handleProjectGet, 
  handleProjectUpdate, 
} from "../handlers/project.js";
import { 
  handleTodoListList, 
  handleTodoListGet, 
  handleTodoListCreate, 
  handleTodoListUpdate, 
  handleTodoListDelete, 
} from "../handlers/todo-list.js";
import { getTodosByListId, getTodoById } from "../database/todo.js";
import { getCurrentProject } from "../database/project.js";
import { getTodoListById, getAllTodoListsForCurrentProject } from "../database/todo-list.js";
import { createErrorResponse, createSuccessResponse, createResourceResponse } from "../utils/response.js";
import { 
  listResources, 
  readResource,
  RESOURCE_URIS 
} from "../handlers/resources.js";

/**
 * MCP Server Setup and Configuration
 * 
 * Extracted from src/index.ts for better organization
 * Handles server creation and tool registration
 */

/**
 * Create and configure the MCP server with all tools
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
      resources: { subscribe: true, listChanged: true },
      logging: {},
    },
  });

  // Register resource handlers for exposing data as discoverable resources
  
  // Static resources
  server.resource(
    "current-project",
    RESOURCE_URIS.PROJECT_CURRENT,
    {
      name: "Current Project",
      description: "Details of the current project including name, location, and default todo list",
      mimeType: "application/json",
    },
    async () => {
      try {
        const project = await getCurrentProject();
        if (!project) {
          throw new Error("No current project found");
        }
        return createResourceResponse(RESOURCE_URIS.PROJECT_CURRENT, project);
      } catch (error) {
        console.error("Error reading current project resource:", error);
        throw error;
      }
    }
  );

  server.resource(
    "all-todos",
    RESOURCE_URIS.TODOS_ALL,
    {
      name: "All Todos",
      description: "All todos from the default todo list, sorted by priority",
      mimeType: "application/json",
    },
    async () => {
      try {
        const todos = await getTodosByListId();
        return createResourceResponse(RESOURCE_URIS.TODOS_ALL, { todos });
      } catch (error) {
        console.error("Error reading all todos resource:", error);
        throw error;
      }
    }
  );

  server.resource(
    "all-todo-lists",
    RESOURCE_URIS.LISTS_ALL,
    {
      name: "All Todo Lists",
      description: "All todo lists for the current project",
      mimeType: "application/json",
    },
    async () => {
      try {
        const todoLists = await getAllTodoListsForCurrentProject();
        return createResourceResponse(RESOURCE_URIS.LISTS_ALL, { todo_lists: todoLists });
      } catch (error) {
        console.error("Error reading todo lists resource:", error);
        throw error;
      }
    }
  );

  server.resource(
    "default-todo-list",
    RESOURCE_URIS.LIST_DEFAULT,
    {
      name: "Default Todo List",
      description: "The default todo list for the current project",
      mimeType: "application/json",
    },
    async () => {
      try {
        const project = await getCurrentProject();
        if (!project?.default_todo_list_id) {
          throw new Error("No default todo list available");
        }
        
        const todoList = await getTodoListById(project.default_todo_list_id);
        if (!todoList) {
          throw new Error("Default todo list not found");
        }
        
        return createResourceResponse(RESOURCE_URIS.LIST_DEFAULT, todoList);
      } catch (error) {
        console.error("Error reading default todo list resource:", error);
        throw error;
      }
    }
  );

  // Dynamic resources with templates
  server.resource(
    "todo-by-id",
    "todo://todo/{id}",
    {
      name: "Todo by ID",
      description: "Individual todo item by ID",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const todoIdStr = uri.pathname.split('/').pop();
        const todoId = parseInt(todoIdStr || '', 10);
        
        if (isNaN(todoId)) {
          throw new Error(`Invalid todo ID: ${todoIdStr}`);
        }
        
        const todo = await getTodoById(todoId);
        if (!todo) {
          throw new Error(`Todo with ID ${todoId} not found`);
        }
        
        return createResourceResponse(uri.href, todo);
      } catch (error) {
        console.error("Error reading todo resource:", error);
        throw error;
      }
    }
  );

  server.resource(
    "todos-by-list-id",
    "todo://todos/list/{id}",
    {
      name: "Todos by List ID",
      description: "All todos in a specific todo list",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const listIdStr = uri.pathname.split('/').pop();
        const listId = parseInt(listIdStr || '', 10);
        
        if (isNaN(listId)) {
          throw new Error(`Invalid todo list ID: ${listIdStr}`);
        }
        
        const todos = await getTodosByListId(listId);
        return createResourceResponse(uri.href, { todos });
      } catch (error) {
        console.error("Error reading todos by list resource:", error);
        throw error;
      }
    }
  );

  server.resource(
    "todo-list-by-id",
    "todo://list/{id}",
    {
      name: "Todo List by ID",
      description: "Specific todo list details by ID",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const listIdStr = uri.pathname.split('/').pop();
        const listId = parseInt(listIdStr || '', 10);
        
        if (isNaN(listId)) {
          throw new Error(`Invalid todo list ID: ${listIdStr}`);
        }
        
        const todoList = await getTodoListById(listId);
        if (!todoList) {
          throw new Error(`Todo list with ID ${listId} not found`);
        }
        
        return createResourceResponse(uri.href, todoList);
      } catch (error) {
        console.error("Error reading todo list resource:", error);
        throw error;
      }
    }
  );

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
      return await handleTodoRead({ id });
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
    "Delete multiple todo items by their IDs in a single batch operation with transaction support. This permanently removes the todos from the database.\n\nExamples:\n• Delete multiple: {todo_ids: [1, 2, 3]}\n• Delete single in batch: {todo_ids: [5]}\n  Returns batch operation results with success/failure count",
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
    "Move multiple todo items to a different todo list in a single batch operation with transaction support. This updates the todo_list_id for all specified todos.\n\nExamples:\n• Move multiple: {todo_ids: [1, 2, 3], target_todo_list_id: 5}\n• Move single in batch: {todo_ids: [7], target_todo_list_id: 2}\n  Returns batch operation results with success/failure count",
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
      return await handleProjectGet();
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
      return await handleProjectUpdate({ name, default_todo_list_id });
    },
  );

  // Tool to list all todo lists
  server.tool(
    "todo-list-list",
    `List all todo lists for the current project.
Example:
• No parameters needed
  Returns: {"todo_lists": [{"id": 1, "name": "Default", "description": "...", "num_completed": 5, "total_count": 10}, ...]}`,
    {},
    async () => {
      return await handleTodoListList();
    },
  );

  // Tool to get details of a specific todo list
  server.tool(
    "todo-list-get",
    `Get details of a specific todo list by ID, or get the default todo list if no ID provided.

Examples:
• Get specific list: {id: 1}
• Get default list: {} (no parameters)`,
    {
      id: z
        .number()
        .optional()
        .describe(
          "The ID of the todo list to retrieve. If not provided, returns the current project's default todo list.",
        ),
    },
    async ({ id }) => {
      return await handleTodoListGet({ id });
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
      return await handleTodoListCreate({ name, description });
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
      return await handleTodoListUpdate({ id, name, description });
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
      return await handleTodoListDelete({ id });
    },
  );

  return server;
}