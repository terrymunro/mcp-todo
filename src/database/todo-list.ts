import { eq } from "drizzle-orm";
import { todoList, type TodoList } from "../schema.js";
import { getDb } from "./connection.js";
import { initializeProjectContext } from "./project.js";

/**
 * Todo List Database Operations
 * 
 * Handles CRUD operations for todo lists within projects
 */

/**
 * Create a new todo list for the current project
 * 
 * @param name - Todo list name
 * @param description - Optional description
 * @returns Promise resolving to the created todo list
 * @throws Error if creation fails
 */
export async function createTodoList(
  name: string,
  description?: string,
): Promise<TodoList> {
  const db = await getDb();
  const proj = await initializeProjectContext();

  const [inserted] = await db
    .insert(todoList)
    .values({
      project_id: proj.id,
      name,
      description,
    })
    .returning();

  if (!inserted) {
    throw new Error("Failed to create todo list");
  }

  return inserted;
}

/**
 * Get a specific todo list by ID
 * 
 * @param id - Todo list ID
 * @returns Promise resolving to the todo list record or null if not found
 */
export async function getTodoListById(id: number): Promise<TodoList | null> {
  const db = await getDb();
  const [list] = await db.select().from(todoList).where(eq(todoList.id, id));
  return list ?? null;
}

/**
 * Get all todo lists for the current project
 * 
 * @returns Promise resolving to array of todo lists
 */
export async function getAllTodoListsForCurrentProject(): Promise<TodoList[]> {
  const db = await getDb();
  const proj = await initializeProjectContext();

  const lists = await db
    .select()
    .from(todoList)
    .where(eq(todoList.project_id, proj.id));

  return lists;
}

/**
 * Update an existing todo list
 * 
 * @param id - Todo list ID to update
 * @param updates - Object containing fields to update
 * @returns Promise resolving to the updated todo list
 * @throws Error if todo list not found
 */
export async function updateTodoList(
  id: number,
  {
    name,
    description,
  }: {
    name?: string | undefined;
    description?: string | undefined;
  },
): Promise<TodoList> {
  const db = await getDb();

  const [updated] = await db
    .update(todoList)
    .set({
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
    })
    .where(eq(todoList.id, id))
    .returning();

  if (!updated) {
    throw new Error(`Todo list with ID ${id} not found`);
  }

  return updated;
}

/**
 * Delete a todo list by ID
 * Prevents deletion of the project's default todo list
 * 
 * @param id - Todo list ID to delete
 * @throws Error if trying to delete default list or list not found
 */
export async function deleteTodoList(id: number): Promise<void> {
  const db = await getDb();
  const proj = await initializeProjectContext();

  // Do not delete the default list
  if (proj.default_todo_list_id === id) {
    throw new Error("Cannot delete the default todo list for a project");
  }

  await db.delete(todoList).where(eq(todoList.id, id));
}