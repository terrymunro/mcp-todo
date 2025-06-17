import { getCurrentProject, updateProject } from "../database/project.js";
import { createErrorResponse, createSuccessResponse } from "../utils/response.js";

/**
 * Project Handler Functions
 * 
 * Extracted from src/index.ts for better organization
 * Handles all project-related MCP tool operations
 */

/**
 * Handle project get operations
 */
export async function handleProjectGet() {
  try {
    const currentProject = await getCurrentProject();
    if (currentProject) {
      return createSuccessResponse(currentProject);
    } else {
      return createErrorResponse("No current project found.");
    }
  } catch (error) {
    console.error("Error in project-get handler:", error);
    return createErrorResponse(`Failed to get project: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Handle project update operations
 */
export async function handleProjectUpdate({
  name,
  default_todo_list_id,
}: {
  name?: string;
  default_todo_list_id?: number;
}) {
  try {
    const currentProject = await getCurrentProject();
    if (!currentProject) {
      return createErrorResponse("No current project found.");
    }

    if (!name && !default_todo_list_id) {
      return createErrorResponse("At least one field (name or default_todo_list_id) must be provided for updates.");
    }

    const updatedProject = await updateProject(currentProject.id, {
      name,
      default_todo_list_id,
    });

    return createSuccessResponse(`Project updated successfully: ${JSON.stringify(updatedProject, null, 2)}`);
  } catch (error) {
    console.error("Error in project-update handler:", error);
    return createErrorResponse(`Failed to update project: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}