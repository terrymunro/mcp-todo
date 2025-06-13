import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  initializeProjectContext,
  getTodoById,
  saveTodo,
  getTodosByListId,
  getCurrentProject,
  updateProject,
  getTodoListById,
  getAllTodoListsForCurrentProject,
  getCurrentDefaultTodoListId,
} from "./database.js";

// --- Type Definitions ---
const TodoStatusSchema = z.enum(["completed", "pending", "in_progress"]);
const TodoPrioritySchema = z.enum(["high", "medium", "low"]);

// Export schemas for testing and validation
export { TodoStatusSchema, TodoPrioritySchema };


// --- Tool Handlers ---

/**
 * Handle todo write operations with patching support
 */
export async function handleTodoWrite({
  id,
  content,
  priority,
  status,
  todo_list_id
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
      return {
        content: [
          {
            type: "text" as const,
            text: "Content is required when creating a new todo.",
          },
        ],
      };
    }

    // For updates, at least one field must be provided
    if (existingTodo && !content && !priority && !status && !todo_list_id) {
      return {
        content: [
          {
            type: "text" as const,
            text: "At least one field (content, priority, status, or todo_list_id) must be provided for updates.",
          },
        ],
      };
    }

    const savedTodo = await saveTodo({
      id,
      content,
      priority,
      status,
      todo_list_id,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Todo ${id} saved successfully.`,
        },
      ],
    };
  } catch (error) {
    console.error("Error in TodoWrite handler:", error);
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to write todo: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
    };
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
  });

  // Tool to write or update a todo item
  server.tool(
    "todo-write",
    "Create a new todo item or update an existing one with PATCH support. For new todos, content is required. For updates, only specify the fields you want to change.\n\nExamples:\n• Create: {id: 1, content: \"Fix bug\", priority: \"high\"}\n• Update status only: {id: 1, status: \"completed\"}\n• Update multiple fields: {id: 1, status: \"in_progress\", priority: \"high\"}",
    {
      id: z.number().describe("The unique identifier for the todo item."),
      content: z
        .string()
        .optional()
        .describe("The content or description of the todo item. Required for new todos, optional for updates."),
      priority: TodoPrioritySchema.optional().describe(
        "Priority level: 'high', 'medium', or 'low'. Defaults to 'medium'.",
      ),
      status: TodoStatusSchema.optional().describe(
        "Status: 'pending', 'in_progress', or 'completed'. Defaults to 'pending'.",
      ),
      todo_list_id: z.number().optional().describe(
        "The ID of the todo list. Defaults to the current project's default todo list.",
      ),
    },
    async ({ id, content, priority, status, todo_list_id }) => {
      return await handleTodoWrite({ id, content, priority, status, todo_list_id });
    }
  );

  // Tool to read a specific todo item by its ID
  server.tool(
    "todo-read",
    "Retrieve a specific todo item by its ID. Returns the complete todo object with all fields (id, content, status, priority).\n\nExample:\n• Get todo: {id: 1}\n  Returns: {\"id\": 1, \"content\": \"Fix bug\", \"status\": \"pending\", \"priority\": \"high\"}",
    {
      id: z.number().describe("The ID of the todo item to retrieve."),
      todo_list_id: z.number().optional().describe(
        "The ID of the todo list to search in. Optional - the todo will be found regardless of which list it's in.",
      ),
    },
    async ({ id }) => {
      try {
        const todo = await getTodoById(id);
        if (todo) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(todo, null, 2),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: `Todo with ID ${id} not found.`,
              },
            ],
          };
        }
      } catch (error) {
        console.error("Error in TodoRead handler:", error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to read todo ${id}: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // Tool to list all todo items, ordered by priority
  server.tool(
    "todo-list",
    "List all todo items sorted by priority (high → medium → low). Returns an array of all todos with complete details.\n\nExample:\n• No parameters needed\n  Returns: {\"todos\": [{\"id\": 1, \"content\": \"Fix bug\", \"status\": \"pending\", \"priority\": \"high\"}, ...]}",
    {
      todo_list_id: z.number().optional().describe(
        "The ID of the todo list to retrieve todos from. Defaults to the current project's default todo list.",
      ),
    },
    async ({ todo_list_id }) => {
      try {
        const todos = await getTodosByListId(todo_list_id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ todos }, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error("Error in TodoList handler:", error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to list todos: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // Tool to get current project details
  server.tool(
    "project-get",
    "Get the current project details including name, location, and default todo list.\n\nExample:\n• No parameters needed\n  Returns: {\"id\": 1, \"name\": \"My Project\", \"location\": \"/path/to/project\", \"default_todo_list_id\": 1}",
    {},
    async () => {
      try {
        const currentProject = await getCurrentProject();
        if (currentProject) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(currentProject, null, 2),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: "No current project found.",
              },
            ],
          };
        }
      } catch (error) {
        console.error("Error in project-get handler:", error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to get project: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // Tool to update current project
  server.tool(
    "project-update",
    "Update the current project's name or default todo list.\n\nExamples:\n• Update name: {name: \"New Project Name\"}\n• Update default todo list: {default_todo_list_id: 2}\n• Update both: {name: \"New Name\", default_todo_list_id: 2}",
    {
      name: z.string().optional().describe("The new name for the project."),
      default_todo_list_id: z.number().optional().describe("The ID of the todo list to set as default."),
    },
    async ({ name, default_todo_list_id }) => {
      try {
        const currentProject = await getCurrentProject();
        if (!currentProject) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No current project found.",
              },
            ],
          };
        }

        if (!name && !default_todo_list_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: "At least one field (name or default_todo_list_id) must be provided for updates.",
              },
            ],
          };
        }

        const updatedProject = await updateProject(currentProject.id, {
          name,
          default_todo_list_id,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Project updated successfully: ${JSON.stringify(updatedProject, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        console.error("Error in project-update handler:", error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to update project: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // Tool to list all todo lists
  server.tool(
    "todo_list-list",
    "List all todo lists for the current project.\n\nExample:\n• No parameters needed\n  Returns: {\"todo_lists\": [{\"id\": 1, \"name\": \"Default\", \"description\": \"...\", \"num_completed\": 5, \"total_count\": 10}, ...]}",
    {},
    async () => {
      try {
        const todoLists = await getAllTodoListsForCurrentProject();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ todo_lists: todoLists }, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error("Error in todo_list-list handler:", error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to list todo lists: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // Tool to get details of a specific todo list
  server.tool(
    "todo_list-get",
    "Get details of a specific todo list by ID, or get the default todo list if no ID provided.\n\nExamples:\n• Get specific list: {id: 1}\n• Get default list: {} (no parameters)",
    {
      id: z.number().optional().describe("The ID of the todo list to retrieve. If not provided, returns the current project's default todo list."),
    },
    async ({ id }) => {
      try {
        const todoListId = id || getCurrentDefaultTodoListId();
        
        if (!todoListId) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No todo list ID provided and no default todo list available.",
              },
            ],
          };
        }

        const todoList = await getTodoListById(todoListId);
        
        if (todoList) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(todoList, null, 2),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: `Todo list with ID ${todoListId} not found.`,
              },
            ],
          };
        }
      } catch (error) {
        console.error("Error in todo_list-get handler:", error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to get todo list: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
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
  console.log("Available tools: todo-write, todo-read, todo-list, project-get, project-update, todo_list-list, todo_list-get");
}

// Start the server only if this is the main module
if (import.meta.main) {
  main().catch(console.error);
}
