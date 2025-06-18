import { 
  getTodoById, 
  getTodosByListId, 
} from "../database/todo.js";
import { 
  getCurrentProject, 
} from "../database/project.js";
import { 
  getTodoListById, 
  getAllTodoListsForCurrentProject, 
} from "../database/todo-list.js";
import { 
  createResourceResponse,
  type ResourceListItem, 
} from "../utils/response.js";

/**
 * Resource Handler Functions
 * 
 * Handles MCP resource operations for exposing todo data
 * as discoverable resources rather than tool-based access
 */

/**
 * Resource URI patterns supported by this server
 */
export const RESOURCE_URIS = {
  PROJECT_CURRENT: "todo://project/current",
  TODOS_ALL: "todo://todos/all", 
  TODOS_LIST: "todo://todos/list/",
  TODO_BY_ID: "todo://todo/",
  LISTS_ALL: "todo://lists/all",
  LIST_BY_ID: "todo://list/",
  LIST_DEFAULT: "todo://list/default",
} as const;

/**
 * List all available resources for discovery
 */
export async function listResources() {
  const resources: ResourceListItem[] = [
    {
      uri: RESOURCE_URIS.PROJECT_CURRENT,
      name: "Current Project",
      description: "Details of the current project including name, location, and default todo list",
      mimeType: "application/json",
    },
    {
      uri: RESOURCE_URIS.TODOS_ALL,
      name: "All Todos",
      description: "All todos from the default todo list, sorted by priority",
      mimeType: "application/json",
    },
    {
      uri: RESOURCE_URIS.LISTS_ALL,
      name: "All Todo Lists", 
      description: "All todo lists for the current project",
      mimeType: "application/json",
    },
    {
      uri: RESOURCE_URIS.LIST_DEFAULT,
      name: "Default Todo List",
      description: "The default todo list for the current project",
      mimeType: "application/json",
    },
  ];

  // Add dynamic resources for existing todos and lists
  try {
    // Add todo list resources
    const todoLists = await getAllTodoListsForCurrentProject();
    for (const list of todoLists) {
      resources.push({
        uri: `${RESOURCE_URIS.TODOS_LIST}${list.id}`,
        name: `Todos in ${list.name}`,
        description: `All todos in the "${list.name}" todo list`,
        mimeType: "application/json",
      });
      
      resources.push({
        uri: `${RESOURCE_URIS.LIST_BY_ID}${list.id}`,
        name: `Todo List: ${list.name}`,
        description: `Details of the "${list.name}" todo list`,
        mimeType: "application/json",
      });
    }

    // Add individual todo resources from default list
    const todos = await getTodosByListId();
    for (const todo of todos) {
      resources.push({
        uri: `${RESOURCE_URIS.TODO_BY_ID}${todo.id}`,
        name: `Todo: ${todo.content.substring(0, 50)}${todo.content.length > 50 ? "..." : ""}`,
        description: `Individual todo item: ${todo.content}`,
        mimeType: "application/json",
      });
    }
  } catch (error) {
    console.error("Error listing dynamic resources:", error);
    // Continue with static resources even if dynamic discovery fails
  }

  return resources;
}

/**
 * Read a specific resource by URI
 */
export async function readResource(uri: string) {
  try {
    // Current project
    if (uri === RESOURCE_URIS.PROJECT_CURRENT) {
      const project = await getCurrentProject();
      if (!project) {
        throw new Error("No current project found");
      }
      return createResourceResponse(uri, project);
    }

    // All todos from default list
    if (uri === RESOURCE_URIS.TODOS_ALL) {
      const todos = await getTodosByListId();
      return createResourceResponse(uri, { todos });
    }

    // All todo lists
    if (uri === RESOURCE_URIS.LISTS_ALL) {
      const todoLists = await getAllTodoListsForCurrentProject();
      return createResourceResponse(uri, { todo_lists: todoLists });
    }

    // Default todo list
    if (uri === RESOURCE_URIS.LIST_DEFAULT) {
      const project = await getCurrentProject();
      if (!project?.default_todo_list_id) {
        throw new Error("No default todo list available");
      }
      
      const todoList = await getTodoListById(project.default_todo_list_id);
      if (!todoList) {
        throw new Error("Default todo list not found");
      }
      
      return createResourceResponse(uri, todoList);
    }

    // Todos for specific list
    if (uri.startsWith(RESOURCE_URIS.TODOS_LIST)) {
      const listIdStr = uri.substring(RESOURCE_URIS.TODOS_LIST.length);
      const listId = parseInt(listIdStr, 10);
      
      if (isNaN(listId)) {
        throw new Error(`Invalid todo list ID: ${listIdStr}`);
      }
      
      const todos = await getTodosByListId(listId);
      return createResourceResponse(uri, { todos });
    }

    // Individual todo by ID
    if (uri.startsWith(RESOURCE_URIS.TODO_BY_ID)) {
      const todoIdStr = uri.substring(RESOURCE_URIS.TODO_BY_ID.length);
      const todoId = parseInt(todoIdStr, 10);
      
      if (isNaN(todoId)) {
        throw new Error(`Invalid todo ID: ${todoIdStr}`);
      }
      
      const todo = await getTodoById(todoId);
      if (!todo) {
        throw new Error(`Todo with ID ${todoId} not found`);
      }
      
      return createResourceResponse(uri, todo);
    }

    // Specific todo list by ID
    if (uri.startsWith(RESOURCE_URIS.LIST_BY_ID)) {
      const listIdStr = uri.substring(RESOURCE_URIS.LIST_BY_ID.length);
      const listId = parseInt(listIdStr, 10);
      
      if (isNaN(listId)) {
        throw new Error(`Invalid todo list ID: ${listIdStr}`);
      }
      
      const todoList = await getTodoListById(listId);
      if (!todoList) {
        throw new Error(`Todo list with ID ${listId} not found`);
      }
      
      return createResourceResponse(uri, todoList);
    }

    // Unknown resource
    throw new Error(`Unknown resource URI: ${uri}`);
    
  } catch (error) {
    console.error("Error reading resource:", error);
    throw error;
  }
}