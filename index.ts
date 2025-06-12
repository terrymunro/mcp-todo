import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";

// --- Configuration ---
export const TODO_DIR = path.join(process.cwd(), "todos");

// --- Type Definitions ---
const TodoStatusSchema = z.enum(["completed", "pending", "in_progress"]);
const TodoPrioritySchema = z.enum(["high", "medium", "low"]);

const TodoSchema = z.object({
  id: z.number(),
  content: z.string(),
  status: TodoStatusSchema.default("pending"),
  priority: TodoPrioritySchema.default("medium"),
});

export type Todo = z.infer<typeof TodoSchema>;

// Export schemas for testing
export { TodoSchema, TodoStatusSchema, TodoPrioritySchema };

// --- File System Storage Logic ---

/**
 * Ensures the directory for storing todo items exists.
 */
export async function ensureTodoDirectoryExists(): Promise<void> {
  try {
    await fs.mkdir(TODO_DIR, { recursive: true });
    console.log(`Todo directory ensured at: ${TODO_DIR}`);
  } catch (error) {
    console.error("Error creating todo directory:", error);
    throw error;
  }
}

/**
 * Writes a todo item to a JSON file.
 * @param todo The todo item to save.
 */
export async function writeTodoToFile(todo: Todo): Promise<void> {
  const filePath = path.join(TODO_DIR, `${todo.id}.json`);
  try {
    await fs.writeFile(filePath, JSON.stringify(todo, null, 2), "utf-8");
    console.log(`Successfully wrote todo ${todo.id} to ${filePath}`);
  } catch (error) {
    console.error(`Error writing todo ${todo.id}:`, error);
    throw error;
  }
}

/**
 * Reads a single todo item from a JSON file.
 * @param id The ID of the todo item to read.
 * @returns The todo item or null if not found.
 */
export async function readTodoFromFile(id: number): Promise<Todo | null> {
  const filePath = path.join(TODO_DIR, `${id}.json`);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const todo = JSON.parse(data);
    return TodoSchema.parse(todo); // Validate the data against the schema
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // File does not exist
      return null;
    }
    console.error(`Error reading or parsing todo ${id}:`, error);
    throw error;
  }
}

/**
 * Reads all todo items from the directory.
 * @returns An array of all todo items.
 */
export async function readAllTodos(): Promise<Todo[]> {
  try {
    const files = await fs.readdir(TODO_DIR);
    const todoPromises = files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        const id = parseInt(path.basename(file, ".json"), 10);
        if (!isNaN(id)) {
          try {
            return await readTodoFromFile(id);
          } catch (error) {
            // Gracefully handle corrupted files by returning null
            console.error(`Error reading todo ${id}:`, error);
            return null;
          }
        }
        return null;
      });

    const todosWithNulls = await Promise.all(todoPromises);
    // Filter out any null results which could happen from parsing errors or non-matching files
    return todosWithNulls.filter((t): t is Todo => t !== null);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // If the directory doesn't exist, there are no todos.
      return [];
    }
    console.error("Error reading all todos:", error);
    throw error;
  }
}

// --- Tool Handlers ---

/**
 * Handle todo write operations with patching support
 */
export async function handleTodoWrite({
  id,
  content,
  priority,
  status
}: {
  id: number;
  content?: string;
  priority?: "high" | "medium" | "low";
  status?: "completed" | "pending" | "in_progress";
}) {
  try {
    // Check if the item already exists to preserve its fields if not provided
    const existingTodo = await readTodoFromFile(id);

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
    if (existingTodo && !content && !priority && !status) {
      return {
        content: [
          {
            type: "text" as const,
            text: "At least one field (content, priority, or status) must be provided for updates.",
          },
        ],
      };
    }

    const todo: Todo = {
      id,
      content: content || existingTodo?.content || "",
      priority: priority || existingTodo?.priority || "medium",
      status: status || existingTodo?.status || "pending",
    };

    await writeTodoToFile(todo);
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
          text: "Failed to write todo.",
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
    },
    async ({ id, content, priority, status }) => {
      return await handleTodoWrite({ id, content, priority, status });
    }
  );

  // Tool to read a specific todo item by its ID
  server.tool(
    "todo-read",
    "Retrieve a specific todo item by its ID. Returns the complete todo object with all fields (id, content, status, priority).\n\nExample:\n• Get todo: {id: 1}\n  Returns: {\"id\": 1, \"content\": \"Fix bug\", \"status\": \"pending\", \"priority\": \"high\"}",
    {
      id: z.number().describe("The ID of the todo item to retrieve."),
    },
    async ({ id }) => {
      try {
        const todo = await readTodoFromFile(id);
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
              text: `Failed to read todo ${id}.`,
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
    {},
    async () => {
      try {
        const todos = await readAllTodos();

        // Define the order for sorting by priority
        const priorityOrder = { high: 0, medium: 1, low: 2 };

        // Sort the todos: high -> medium -> low
        todos.sort(
          (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
        );

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
              text: "Failed to list todos.",
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
  // Ensure the storage directory exists before starting the server
  await ensureTodoDirectoryExists();

  const server = createTodoServer();
  const transport = new StdioServerTransport();

  console.log("Starting MCP Todo Server...");
  await server.connect(transport);
  console.log("MCP Todo Server is running.");
  console.log("Available tools: todo-write, todo-read, todo-list");
}

// Start the server only if this is the main module
if (import.meta.main) {
  main().catch(console.error);
}
