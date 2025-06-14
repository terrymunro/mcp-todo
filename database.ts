import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as fs from "fs/promises";
import * as path from "path";
import { eq, desc } from "drizzle-orm";
import {
  project,
  todoList,
  todo,
  settings,
  createTriggers,
  type Project,
  type NewProject,
  type TodoList,
  type NewTodoList,
  type Todo,
  type NewTodo,
} from "./schema";

/**
 * Resolves the XDG data directory path for storing the SQLite database
 * Uses $XDG_DATA_HOME if set, otherwise falls back to ~/.local/share
 */
export function getDataDirectory(): string {
  const xdgDataHome = process.env.XDG_DATA_HOME;

  if (xdgDataHome) {
    return path.join(xdgDataHome, "mcp-todo");
  }

  // Fallback to ~/.local/share/mcp-todo
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) {
    throw new Error("Unable to determine home directory");
  }

  return path.join(homeDir, ".local", "share", "mcp-todo");
}

/**
 * Gets the full path to the SQLite database file
 */
export function getDatabasePath(): string {
  return path.join(getDataDirectory(), "todos.db");
}

/**
 * Ensures the data directory exists, creating it if necessary
 */
export async function ensureDataDirectoryExists(): Promise<void> {
  const dataDir = getDataDirectory();

  try {
    await fs.mkdir(dataDir, { recursive: true });
    console.log(`Data directory ensured at: ${dataDir}`);
  } catch (error) {
    console.error("Error creating data directory:", error);
    throw error;
  }
}

/**
 * Finds the project root by walking up the directory tree looking for common project indicators.
 * Returns the project root path, or falls back to the current working directory if no indicators are found.
 */
export async function findProjectRoot(startPath?: string): Promise<string> {
  const start = startPath || process.cwd();
  let currentPath = path.resolve(start);
  
  // Common project root indicators (in order of preference)
  const projectIndicators = [
    '.git',           // Git repository
    'package.json',   // Node.js/npm project
    'Cargo.toml',     // Rust project
    'pyproject.toml', // Python project (modern)
    'setup.py',       // Python project (legacy)
    'go.mod',         // Go project
    'Makefile',       // Various projects with Makefile
    '.project',       // Eclipse/IDE project
    'composer.json',  // PHP project
    'pom.xml',        // Maven/Java project
    'build.gradle',   // Gradle project
    'CMakeLists.txt', // CMake project
  ];
  
  while (true) {
    // Check for any project indicators in current directory
    for (const indicator of projectIndicators) {
      const indicatorPath = path.join(currentPath, indicator);
      try {
        await fs.access(indicatorPath);
        // Found a project indicator, this is our project root
        console.log(`Found project root at: ${currentPath} (indicator: ${indicator})`);
        return currentPath;
      } catch {
        // Indicator not found, continue checking
      }
    }
    
    // Move up one directory
    const parentPath = path.dirname(currentPath);
    
    // If we've reached the filesystem root, stop and use the original start path
    if (parentPath === currentPath) {
      console.log(`No project root found, using current directory: ${start}`);
      return start;
    }
    
    currentPath = parentPath;
  }
}

/**
 * Initialize the database connection using the migration system
 */
export async function initializeDatabase() {
  await ensureDataDirectoryExists();

  const dbPath = getDatabasePath();
  console.log(`Initializing database at: ${dbPath}`);

  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite);

  // Enable foreign keys
  sqlite.exec("PRAGMA foreign_keys = ON;");

  // Apply migrations if needed
  try {
    await applyMigrationsIfNeeded(db, sqlite);
  } catch (error) {
    console.error('Error applying migrations:', error);
    // For now, continue with manual schema creation as fallback
    await createSchemaManually(sqlite);
  }

  return { db, sqlite };
}

/**
 * Apply database migrations if needed
 */
async function applyMigrationsIfNeeded(db: ReturnType<typeof drizzle>, sqlite: Database) {
  const { migrate } = await import('drizzle-orm/bun-sqlite/migrator');
  
  // Check if migrations folder exists
  try {
    await import('fs/promises').then(fs => fs.access('./drizzle'));
    
    // Apply migrations
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Migrations applied successfully');
    
    // Apply additional SQL that Drizzle doesn't handle
    await applyAdditionalSQL(sqlite);
    
  } catch (error) {
    console.log('Migrations folder not found or migration failed, falling back to manual schema creation');
    throw error;
  }
}

/**
 * Apply additional SQL statements that aren't handled by Drizzle migrations
 */
async function applyAdditionalSQL(sqlite: Database) {
  // Create triggers for auto-updating timestamps
  for (const trigger of createTriggers) {
    sqlite.exec(trigger);
  }

  // Create triggers for updating todo list statistics
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS update_todo_list_stats_on_insert
    AFTER INSERT ON todo
    BEGIN
      UPDATE todo_list SET 
        num_completed = (SELECT COUNT(*) FROM todo WHERE todo_list_id = NEW.todo_list_id AND status = 'completed'),
        total_count = (SELECT COUNT(*) FROM todo WHERE todo_list_id = NEW.todo_list_id)
      WHERE id = NEW.todo_list_id;
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS update_todo_list_stats_on_update
    AFTER UPDATE ON todo
    BEGIN
      UPDATE todo_list SET 
        num_completed = (SELECT COUNT(*) FROM todo WHERE todo_list_id = NEW.todo_list_id AND status = 'completed'),
        total_count = (SELECT COUNT(*) FROM todo WHERE todo_list_id = NEW.todo_list_id)
      WHERE id = NEW.todo_list_id;
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS update_todo_list_stats_on_delete
    AFTER DELETE ON todo
    BEGIN
      UPDATE todo_list SET 
        num_completed = (SELECT COUNT(*) FROM todo WHERE todo_list_id = OLD.todo_list_id AND status = 'completed'),
        total_count = (SELECT COUNT(*) FROM todo WHERE todo_list_id = OLD.todo_list_id)
      WHERE id = OLD.todo_list_id;
    END;
  `);
}

/**
 * Fallback manual schema creation (legacy approach)
 */
async function createSchemaManually(sqlite: Database) {
  console.log('Creating schema manually as fallback');
  
  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS project (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      default_todo_list_id INTEGER REFERENCES todo_list(id),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS todo_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      num_completed INTEGER,
      total_count INTEGER,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS todo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      todo_list_id INTEGER NOT NULL REFERENCES todo_list(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'medium',
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Create indexes
  sqlite.exec(`CREATE INDEX IF NOT EXISTS location_idx ON project(location);`);

  await applyAdditionalSQL(sqlite);
}

// Global database connection - will be initialized on first use
let dbConnection: { db: ReturnType<typeof drizzle>; sqlite: Database } | null =
  null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Lazily initialise and cache a Drizzle database connection so that the same
 * connection is reused across helper calls within the same process.  Tests
 * intentionally spin up isolated processes, therefore we do not attempt to
 * persist the reference across different Bun test workers.
 */
async function getDb() {
  if (!dbConnection) {
    dbConnection = await initializeDatabase();
  }

  return dbConnection.db;
}

// In-memory cache for the project that belongs to the current working
// directory.  This is purely an optimisation so that repeated helper calls do
// not re-query the database each time.
let cachedProject: Project | null = null;

/** Convenience getter used by tests */
export function getCurrentDefaultTodoListId(): number | null {
  return cachedProject?.default_todo_list_id ?? null;
}

/**
 * Clears the cached project, forcing the next project lookup to re-query the database
 * Useful for testing scenarios where you need to reset the cache
 */
export function clearProjectCache(): void {
  cachedProject = null;
}

/**
 * Clears the cached database connection, forcing the next database operation to create a fresh connection
 * Useful for testing scenarios where you need to reset the database connection
 */
export function clearDatabaseConnectionCache(): void {
  if (dbConnection) {
    try {
      dbConnection.sqlite.close();
    } catch (error) {
      // Ignore errors when closing the connection, as it might already be closed
      console.warn("Warning: Error closing database connection during cache clear:", error);
    }
  }
  dbConnection = null;
}

/**
 * Clears both the project cache and database connection cache
 * Useful for testing scenarios where you need a complete reset
 */
export function clearAllCaches(): void {
  clearProjectCache();
  clearDatabaseConnectionCache();
}

// ---------------------------------------------------------------------------
// Project boot-strapping helpers
// ---------------------------------------------------------------------------

/**
 * Ensures that a row exists in the `project` table for the current project root
 * (found by walking up from the current working directory looking for project indicators).
 * If the project did not exist it is created together with a default todo list.
 * The helper caches the resulting row so that subsequent calls are inexpensive.
 */
export async function initializeProjectContext(): Promise<Project> {
  const db = await getDb();

  const projectRoot = await findProjectRoot();

  // Try cache first
  if (cachedProject && cachedProject.location === projectRoot) {
    return cachedProject;
  }

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

  // 3. Ensure the project has a default todo list.  If not, create one.
  if (!proj.default_todo_list_id) {
    const [list] = await db
      .insert(todoList)
      .values({
        project_id: proj.id,
        name: "Inbox",
        description: "Default list",
      })
      .returning();

    // Update project row with the newly created default list.
    await db
      .update(project)
      .set({ default_todo_list_id: list.id })
      .where(eq(project.id, proj.id));

    proj = { ...proj, default_todo_list_id: list.id };
  }

  cachedProject = proj;
  return proj;
}

export async function getCurrentProject(): Promise<Project | null> {
  if (cachedProject) return cachedProject;

  const db = await getDb();
  const projectRoot = await findProjectRoot();

  const [proj] = await db.select().from(project).where(eq(project.location, projectRoot));

  if (proj) {
    cachedProject = proj;
  }

  return proj ?? null;
}

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

  // If we updated the current project → sync cache
  if (cachedProject && cachedProject.id === id) {
    cachedProject = updated;
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Todo list helpers
// ---------------------------------------------------------------------------

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

  return inserted;
}

export async function getTodoListById(id: number): Promise<TodoList | null> {
  const db = await getDb();
  const [list] = await db.select().from(todoList).where(eq(todoList.id, id));
  return list ?? null;
}

export async function getAllTodoListsForCurrentProject(): Promise<TodoList[]> {
  const db = await getDb();
  const proj = await initializeProjectContext();

  const lists = await db
    .select()
    .from(todoList)
    .where(eq(todoList.project_id, proj.id));

  return lists;
}

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

export async function deleteTodoList(id: number): Promise<void> {
  const db = await getDb();

  const proj = await initializeProjectContext();

  // Do not delete the default list
  if (proj.default_todo_list_id === id) {
    throw new Error("Cannot delete the default todo list for a project");
  }

  const result = await db.delete(todoList).where(eq(todoList.id, id));

  if (result.changes === 0) {
    throw new Error(`Todo list with ID ${id} not found`);
  }
}

// ---------------------------------------------------------------------------
// Todo helpers
// ---------------------------------------------------------------------------

export async function getTodoById(id: number): Promise<Todo | null> {
  const db = await getDb();
  const [row] = await db.select().from(todo).where(eq(todo.id, id));
  return row ?? null;
}

export async function getTodosByListId(
  listId?: number,
): Promise<Todo[]> {
  const db = await getDb();

  let effectiveListId = listId;
  if (!effectiveListId) {
    const proj = await initializeProjectContext();
    effectiveListId = proj.default_todo_list_id!;
  }

  const todos = await db
    .select()
    .from(todo)
    .where(eq(todo.todo_list_id, effectiveListId));

  // Application sorting – high → medium → low, then by id (ASC)
  const priorityWeight: Record<string, number> = { high: 0, medium: 1, low: 2 };

  return todos.sort((a, b) => {
    const pa = priorityWeight[a.priority] ?? 3;
    const pb = priorityWeight[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    return a.id - b.id;
  });
}

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
  if (content !== undefined) updateFields.content = content;
  if (priority !== undefined) updateFields.priority = priority;
  if (status !== undefined) updateFields.status = status;
  if (todo_list_id !== undefined) updateFields.todo_list_id = todo_list_id;

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

export async function deleteTodo(id: number): Promise<void> {
  const db = await getDb();

  // Check if todo exists first
  const existing = await getTodoById(id);
  if (!existing) {
    throw new Error(`Todo with ID ${id} not found`);
  }

  const result = await db.delete(todo).where(eq(todo.id, id));

  if (result.changes === 0) {
    throw new Error(`Failed to delete todo with ID ${id}`);
  }
}

/**
 * Save multiple todos in a single transaction
 * Returns an array of results indicating success/failure for each todo
 */
export async function saveTodoBatch(
  todos: Array<{
    id: number;
    content?: string;
    priority?: "high" | "medium" | "low";
    status?: "completed" | "pending" | "in_progress";
    todo_list_id?: number;
  }>
): Promise<Array<{ id: number; success: boolean; todo?: Todo; error?: string }>> {
  // Ensure db connection is available
  if (!dbConnection) {
    await getDb();
  }
  
  const results: Array<{ id: number; success: boolean; todo?: Todo; error?: string }> = [];
  const sqlite = dbConnection!.sqlite;
  
  try {
    sqlite.exec("BEGIN TRANSACTION");
    
    for (const todoData of todos) {
      try {
        const savedTodo = await saveTodo(todoData);
        results.push({
          id: todoData.id,
          success: true,
          todo: savedTodo
        });
      } catch (error) {
        results.push({
          id: todoData.id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
    
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
  
  return results;
}

/**
 * Delete multiple todos in a single transaction
 * Returns an array of results indicating success/failure for each todo
 */
export async function deleteTodoBatch(
  todoIds: number[]
): Promise<Array<{ id: number; success: boolean; error?: string }>> {
  // Ensure db connection is available
  if (!dbConnection) {
    await getDb();
  }
  
  const results: Array<{ id: number; success: boolean; error?: string }> = [];
  const sqlite = dbConnection!.sqlite;
  
  try {
    sqlite.exec("BEGIN TRANSACTION");
    
    for (const id of todoIds) {
      try {
        await deleteTodo(id);
        results.push({
          id,
          success: true
        });
      } catch (error) {
        results.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
    
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
  
  return results;
}

/**
 * Move multiple todos to a different todo list in a single transaction
 * Returns an array of results indicating success/failure for each todo
 */
export async function moveTodosBatch(
  todoIds: number[],
  targetTodoListId: number
): Promise<Array<{ id: number; success: boolean; error?: string }>> {
  // Ensure db connection is available
  if (!dbConnection) {
    await getDb();
  }
  
  const results: Array<{ id: number; success: boolean; error?: string }> = [];
  const sqlite = dbConnection!.sqlite;
  
  // Validate target todo list exists before starting transaction
  const targetList = await getTodoListById(targetTodoListId);
  if (!targetList) {
    throw new Error(`Target todo list with ID ${targetTodoListId} not found`);
  }
  
  try {
    sqlite.exec("BEGIN TRANSACTION");
    
    for (const id of todoIds) {
      try {
        // Check if todo exists
        const existingTodo = await getTodoById(id);
        if (!existingTodo) {
          results.push({
            id,
            success: false,
            error: `Todo with ID ${id} not found`
          });
          continue;
        }
        
        // Move the todo by updating its todo_list_id
        await saveTodo({
          id,
          todo_list_id: targetTodoListId
        });
        
        results.push({
          id,
          success: true
        });
      } catch (error) {
        results.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
    
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
  
  return results;
}

