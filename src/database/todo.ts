import { eq, sql } from "drizzle-orm";
import { todo, todoList, type Todo, type NewTodo, type TodoList } from "../schema.js";
import { getDb } from "./connection.js";
import { initializeProjectContext } from "./project.js";

/**
 * Todo Database Operations
 * 
 * Handles CRUD operations for todos with SQL-based priority sorting
 */

/**
 * Internal helper: Get a specific todo list by ID
 * Used to validate todo list existence during todo operations
 * 
 * @param id - Todo list ID
 * @returns Promise resolving to the todo list record or null if not found
 */
async function getTodoListById(id: number): Promise<TodoList | null> {
  const db = await getDb();
  const [list] = await db.select().from(todoList).where(eq(todoList.id, id));
  return list ?? null;
}

/**
 * Get a single todo by ID
 * 
 * @param id - Todo ID
 * @returns Promise resolving to the todo record or null if not found
 */
export async function getTodoById(id: number): Promise<Todo | null> {
  const db = await getDb();
  const [row] = await db.select().from(todo).where(eq(todo.id, id));
  return row ?? null;
}

/**
 * Get all todos for a specific todo list with SQL-based priority sorting
 * Uses CASE statement for optimal database-level sorting: high → medium → low, then by ID
 * 
 * @param listId - Todo list ID (defaults to current project's default list)
 * @returns Promise resolving to sorted array of todos
 */
export async function getTodosByListId(listId?: number): Promise<Todo[]> {
  const db = await getDb();

  let effectiveListId = listId;
  if (!effectiveListId) {
    const proj = await initializeProjectContext();
    effectiveListId = proj.default_todo_list_id!;
  }

  // SQL-based priority sorting using CASE statement for performance
  // This replaces the previous in-memory sorting approach
  const todos = await db
    .select()
    .from(todo)
    .where(eq(todo.todo_list_id, effectiveListId))
    .orderBy(
      // Priority sorting: high=0, medium=1, low=2, unknown=3
      sql`CASE 
        WHEN priority = 'high' THEN 0 
        WHEN priority = 'medium' THEN 1 
        WHEN priority = 'low' THEN 2 
        ELSE 3 
      END`,
      // Secondary sort by ID for consistent ordering
      todo.id,
    );

  return todos;
}

/**
 * Create or update a todo with PATCH-style semantics
 * 
 * @param params - Todo parameters for create/update
 * @param params.id - Todo ID
 * @param params.content - Todo content (required for new todos)
 * @param params.priority - Todo priority
 * @param params.status - Todo status
 * @param params.todo_list_id - Todo list ID
 * @returns Promise resolving to the created/updated todo
 * @throws Error if validation fails
 */
export async function saveTodo({
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
}): Promise<Todo> {
  const db = await getDb();

  // Determine if todo exists already
  const existing = await getTodoById(id);

  if (!existing) {
    // Creating new todo – content is mandatory
    if (!content) {
      throw new Error("Content is required when creating a new todo");
    }

    // Resolve todo_list_id (defaults to current default list)
    let listId = todo_list_id;
    if (!listId) {
      const proj = await initializeProjectContext();
      listId = proj.default_todo_list_id!;
    }

    // Validate list exists
    const list = await getTodoListById(listId!);
    if (!list) {
      throw new Error(`Todo list with ID ${listId} not found`);
    }

    // Insert new row
    const [inserted] = await db
      .insert(todo)
      .values({
        id,
        todo_list_id: listId!,
        content,
        priority: priority ?? "medium",
        status: status ?? "pending",
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to create todo");
    }

    return inserted;
  }

  // -----------------------------------------------------------------------
  // Patch / update existing todo
  // -----------------------------------------------------------------------

  // If todo_list_id is specified we must validate it exists before update.
  if (todo_list_id) {
    const list = await getTodoListById(todo_list_id);
    if (!list) {
      throw new Error(`Todo list with ID ${todo_list_id} not found`);
    }
  }

  // Build update object dynamically to only touch provided fields
  const updateFields: Partial<NewTodo> = {};
  if (content !== undefined) {
    updateFields.content = content;
  }
  if (priority !== undefined) {
    updateFields.priority = priority;
  }
  if (status !== undefined) {
    updateFields.status = status;
  }
  if (todo_list_id !== undefined) {
    updateFields.todo_list_id = todo_list_id;
  }

  // No-op if nothing to update – simply return existing row
  if (Object.keys(updateFields).length === 0) {
    return existing;
  }

  const [updated] = await db
    .update(todo)
    .set(updateFields)
    .where(eq(todo.id, id))
    .returning();

  return updated ?? existing;
}

/**
 * Delete a todo by ID
 * 
 * @param id - Todo ID to delete
 * @throws Error if todo not found
 */
export async function deleteTodo(id: number): Promise<void> {
  const db = await getDb();

  // Check if todo exists first
  const existing = await getTodoById(id);
  if (!existing) {
    throw new Error(`Todo with ID ${id} not found`);
  }

  await db.delete(todo).where(eq(todo.id, id));
}