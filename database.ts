import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as fs from "fs/promises";
import * as path from "path";
import { eq, desc } from "drizzle-orm";
import { project, todoList, todo, settings, createTriggers, type Project, type NewProject, type TodoList, type NewTodoList, type Todo, type NewTodo } from "./schema";

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
 * Initialize the database connection and create tables if they don't exist
 */
export async function initializeDatabase() {
  await ensureDataDirectoryExists();
  
  const dbPath = getDatabasePath();
  console.log(`Initializing database at: ${dbPath}`);
  
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite);
  
  // Enable foreign keys
  sqlite.exec("PRAGMA foreign_keys = ON;");
  
  // Create tables if they don't exist
  // Note: Drizzle doesn't have a built-in migration system for SQLite,
  // so we'll create tables manually
  
  // Create project table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS project (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      default_todo_list_id INTEGER REFERENCES todo_list(id),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  
  // Create todo_list table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS todo_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  
  // Create todo table
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
  
  // Create settings table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  
  // Create indexes
  sqlite.exec(`CREATE INDEX IF NOT EXISTS location_idx ON project(location);`);
  
  // Create triggers for auto-updating timestamps
  for (const trigger of createTriggers) {
    sqlite.exec(trigger);
  }
  
  return { db, sqlite };
}

// Global database connection - will be initialized on first use
let dbConnection: { db: ReturnType<typeof drizzle>; sqlite: Database } | null = null;

/**
 * Get the database connection, initializing it if necessary
 */
export async function getDatabase() {
  if (!dbConnection) {
    dbConnection = await initializeDatabase();
  }
  return dbConnection;
}

// In-memory storage for current project's default todo list ID
let currentDefaultTodoListId: number | null = null;

/**
 * Get the current default todo list ID
 */
export function getCurrentDefaultTodoListId(): number | null {
  return currentDefaultTodoListId;
}

/**
 * Set the current default todo list ID
 */
export function setCurrentDefaultTodoListId(id: number): void {
  currentDefaultTodoListId = id;
}

/**
 * Find a project by its location path
 */
export async function findProjectByLocation(location: string): Promise<Project | null> {
  const { db } = await getDatabase();
  
  const result = await db
    .select()
    .from(project)
    .where(eq(project.location, location))
    .limit(1);
  
  return result[0] || null;
}

/**
 * Create a new project with a default todo list
 */
export async function createProjectWithDefaultList(name: string, location: string): Promise<{ project: Project; todoList: TodoList }> {
  const { db } = await getDatabase();
  
  // First create the todo list
  const newTodoList: NewTodoList = {
    name: "Default",
    description: "Default todo list for this project",
  };
  
  const todoListResult = await db.insert(todoList).values(newTodoList).returning();
  if (todoListResult.length === 0) {
    throw new Error("Failed to create todo list");
  }
  const createdTodoList = todoListResult[0]!;
  
  // Then create the project with reference to the todo list
  const newProject: NewProject = {
    name,
    location,
    default_todo_list_id: createdTodoList.id,
  };
  
  const projectResult = await db.insert(project).values(newProject).returning();
  if (projectResult.length === 0) {
    throw new Error("Failed to create project");
  }
  const createdProject = projectResult[0]!;
  
  return {
    project: createdProject,
    todoList: createdTodoList,
  };
}

/**
 * Initialize project context based on current working directory
 * This should be called when the server starts
 */
export async function initializeProjectContext(): Promise<void> {
  const currentLocation = process.cwd();
  
  // Look for existing project at this location
  let currentProject = await findProjectByLocation(currentLocation);
  
  if (!currentProject) {
    // No project found, create a new one
    console.log(`No project found for location: ${currentLocation}`);
    console.log("Creating new project with default todo list...");
    
    // Generate a project name based on the directory name
    const dirName = path.basename(currentLocation);
    const projectName = dirName || "Untitled Project";
    
    const result = await createProjectWithDefaultList(projectName, currentLocation);
    currentProject = result.project;
    
    console.log(`Created project "${projectName}" with default todo list`);
  } else {
    console.log(`Found existing project: ${currentProject.name} at ${currentLocation}`);
  }
  
  // Store the default todo list ID in memory
  if (currentProject.default_todo_list_id) {
    setCurrentDefaultTodoListId(currentProject.default_todo_list_id);
    console.log(`Using default todo list ID: ${currentProject.default_todo_list_id}`);
  } else {
    console.warn("Project found but no default todo list set");
  }
}

// --- SQLite Storage Functions (replacing JSON file functions) ---

/**
 * Get a todo by its ID from any todo list
 * Replaces: readTodoFromFile
 */
export async function getTodoById(id: number): Promise<Todo | null> {
  const { db } = await getDatabase();
  
  const result = await db
    .select()
    .from(todo)
    .where(eq(todo.id, id))
    .limit(1);
  
  return result[0] || null;
}

/**
 * Save a todo (create or update with PATCH support)
 * Replaces: writeTodoToFile
 */
export async function saveTodo(todoData: {
  id: number;
  content?: string;
  status?: "completed" | "pending" | "in_progress";
  priority?: "high" | "medium" | "low";
  todo_list_id?: number;
}): Promise<Todo> {
  const { db } = await getDatabase();
  const { id, content, status, priority, todo_list_id } = todoData;
  
  // Check if todo exists
  const existingTodo = await getTodoById(id);
  
  if (existingTodo) {
    // Update existing todo (PATCH operation)
    const updateData: Partial<NewTodo> = {};
    if (content !== undefined) updateData.content = content;
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (todo_list_id !== undefined) updateData.todo_list_id = todo_list_id;
    
    const result = await db
      .update(todo)
      .set(updateData)
      .where(eq(todo.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error(`Todo with ID ${id} not found`);
    }
    return result[0]!;
  } else {
    // Create new todo
    const defaultTodoListId = todo_list_id || getCurrentDefaultTodoListId();
    
    if (!defaultTodoListId) {
      throw new Error("No todo list ID provided and no default todo list available");
    }
    
    if (!content) {
      throw new Error("Content is required when creating a new todo");
    }
    
    const newTodo: NewTodo = {
      id,
      content,
      status: status || "pending",
      priority: priority || "medium",
      todo_list_id: defaultTodoListId,
    };
    
    const result = await db.insert(todo).values(newTodo).returning();
    if (result.length === 0) {
      throw new Error("Failed to create todo");
    }
    return result[0]!;
  }
}

/**
 * Get all todos for a specific todo list, sorted by priority then by ID
 * Replaces: readAllTodos
 */
export async function getTodosByListId(todoListId?: number): Promise<Todo[]> {
  const { db } = await getDatabase();
  
  const listId = todoListId || getCurrentDefaultTodoListId();
  
  if (!listId) {
    throw new Error("No todo list ID provided and no default todo list available");
  }
  
  const result = await db
    .select()
    .from(todo)
    .where(eq(todo.todo_list_id, listId))
    .orderBy(
      // Order by priority: high -> medium -> low, then by ID
      desc(todo.priority),
      todo.id
    );
  
  // Sort by priority manually since SQLite text sorting doesn't match our needs
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return result.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
    if (priorityDiff !== 0) return priorityDiff;
    return a.id - b.id;
  });
}

// --- Project Management Functions ---

/**
 * Get the current project (based on current working directory)
 */
export async function getCurrentProject(): Promise<Project | null> {
  const currentLocation = process.cwd();
  return await findProjectByLocation(currentLocation);
}

/**
 * Update project information
 */
export async function updateProject(projectId: number, updates: {
  name?: string;
  default_todo_list_id?: number;
}): Promise<Project> {
  const { db } = await getDatabase();
  
  const result = await db
    .update(project)
    .set(updates)
    .where(eq(project.id, projectId))
    .returning();
  
  if (result.length === 0) {
    throw new Error(`Project with ID ${projectId} not found`);
  }
  
  // Update in-memory default if it was changed
  if (updates.default_todo_list_id !== undefined) {
    setCurrentDefaultTodoListId(updates.default_todo_list_id);
  }
  
  return result[0]!;
}

// --- Todo List Management Functions ---

/**
 * Get a todo list by its ID
 */
export async function getTodoListById(id: number): Promise<TodoList | null> {
  const { db } = await getDatabase();
  
  const result = await db
    .select()
    .from(todoList)
    .where(eq(todoList.id, id))
    .limit(1);
  
  return result[0] || null;
}

/**
 * Get all todo lists for the current project
 */
export async function getAllTodoListsForCurrentProject(): Promise<TodoList[]> {
  const { db } = await getDatabase();
  const currentProject = await getCurrentProject();
  
  if (!currentProject) {
    throw new Error("No current project found");
  }
  
  // For now, we'll return all todo lists since we don't have a direct project->todolist relationship
  // In a more complex system, we might want to add a project_id field to todo_list
  const result = await db
    .select()
    .from(todoList)
    .orderBy(todoList.name);
  
  return result;
}

/**
 * Create a new todo list
 */
export async function createTodoList(name: string, description?: string): Promise<TodoList> {
  const { db } = await getDatabase();
  
  const newTodoList: NewTodoList = {
    name,
    description,
  };
  
  const result = await db.insert(todoList).values(newTodoList).returning();
  if (result.length === 0) {
    throw new Error("Failed to create todo list");
  }
  return result[0]!;
}