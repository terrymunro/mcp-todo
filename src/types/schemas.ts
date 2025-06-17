import { z } from "zod";

/**
 * Enhanced Todo Status schema with better error messages
 */
export const TodoStatusSchema = z
  .enum(["completed", "pending", "in_progress"], {
    errorMap: () => ({
      message: "Status must be one of: completed, pending, in_progress",
    }),
  })
  .describe("Todo status indicating current state");

/**
 * Enhanced Todo Priority schema with better error messages
 */
export const TodoPrioritySchema = z
  .enum(["high", "medium", "low"], {
    errorMap: () => ({
      message: "Priority must be one of: high, medium, low",
    }),
  })
  .describe("Todo priority level for ordering");

/**
 * Enhanced content validation with length limits and sanitization
 */
export const TodoContentSchema = z
  .string()
  .min(1, "Content cannot be empty")
  .max(1000, "Content exceeds maximum length of 1000 characters")
  .trim()
  .describe("Todo content/description");

/**
 * Positive integer ID validation
 */
export const TodoIdSchema = z
  .number()
  .int("ID must be an integer")
  .positive("ID must be a positive number")
  .describe("Unique identifier for todo item");

/**
 * Todo list ID validation (optional, positive integer)
 */
export const TodoListIdSchema = z
  .number()
  .int("Todo list ID must be an integer")
  .positive("Todo list ID must be a positive number")
  .optional()
  .describe("ID of the todo list");

/**
 * Project name validation
 */
export const ProjectNameSchema = z
  .string()
  .min(1, "Project name cannot be empty")
  .max(100, "Project name too long (max 100 characters)")
  .trim()
  .describe("Project name");

/**
 * Todo list name validation
 */
export const TodoListNameSchema = z
  .string()
  .min(1, "Todo list name cannot be empty")
  .max(100, "Todo list name too long (max 100 characters)")
  .trim()
  .describe("Todo list name");

/**
 * Todo list description validation
 */
export const TodoListDescriptionSchema = z
  .string()
  .max(500, "Description too long (max 500 characters)")
  .trim()
  .optional()
  .describe("Todo list description");

/**
 * Resource URI validation
 */
export const ResourceUriSchema = z
  .string()
  .refine(
    (uri) => uri.startsWith("todo://"),
    "Resource URI must start with 'todo://'"
  )
  .describe("MCP resource URI for todo data");

/**
 * Resource content type validation
 */
export const ResourceContentTypeSchema = z
  .enum(["application/json", "text/plain"])
  .describe("MIME type for resource content");

// Export schemas for backward compatibility
export { TodoStatusSchema as TodoStatus, TodoPrioritySchema as TodoPriority };