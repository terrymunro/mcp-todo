import * as path from "path";
import { eq } from "drizzle-orm";
import { project, todoList, type Project } from "../schema.js";
import { findProjectRoot } from "../utils/project-root.js";
import { getDb } from "./connection.js";

/**
 * Project Database Operations
 * 
 * Handles CRUD operations for projects including auto-detection
 */

/**
 * Ensures that a row exists in the `project` table for the current project root
 * (found by walking up from the current working directory looking for project indicators).
 * If the project did not exist it is created together with a default todo list.
 * 
 * @returns Promise resolving to the project record
 */
export async function initializeProjectContext(): Promise<Project> {
  const db = await getDb();

  const projectRoot = await findProjectRoot();

  // 1. Lookup existing project by location
  let [proj] = await db.select().from(project).where(eq(project.location, projectRoot));

  // 2. If not found – create it (temporary name derived from folder)
  if (!proj) {
    const name = path.basename(projectRoot) || "project";

    const inserted = await db
      .insert(project)
      .values({ name, location: projectRoot })
      .returning();

    proj = inserted[0]!;
  }

  // 3. Ensure the project has a default todo list. If not, create one.
  if (!proj.default_todo_list_id) {
    const [list] = await db
      .insert(todoList)
      .values({
        project_id: proj.id,
        name: "Inbox",
        description: "Default list",
      })
      .returning();

    if (!list) {
      throw new Error("Failed to create default todo list");
    }

    // Update project row with the newly created default list.
    await db
      .update(project)
      .set({ default_todo_list_id: list.id })
      .where(eq(project.id, proj.id));

    proj = { ...proj, default_todo_list_id: list.id };
  }

  return proj;
}

/**
 * Get the current project without initializing if it doesn't exist
 * 
 * @returns Promise resolving to the project record or null if not found
 */
export async function getCurrentProject(): Promise<Project | null> {
  const db = await getDb();
  const projectRoot = await findProjectRoot();

  const [proj] = await db.select().from(project).where(eq(project.location, projectRoot));

  return proj ?? null;
}

/**
 * Update an existing project's properties
 * 
 * @param id - Project ID to update
 * @param updates - Object containing fields to update
 * @returns Promise resolving to the updated project record
 * @throws Error if project not found
 */
export async function updateProject(
  id: number,
  {
    name,
    default_todo_list_id,
  }: {
    name?: string | undefined;
    default_todo_list_id?: number | undefined;
  },
): Promise<Project> {
  const db = await getDb();

  const [updated] = await db
    .update(project)
    .set({
      ...(name ? { name } : {}),
      ...(default_todo_list_id ? { default_todo_list_id } : {}),
    })
    .where(eq(project.id, id))
    .returning();

  if (!updated) {
    throw new Error(`Project with ID ${id} not found`);
  }

  return updated;
}