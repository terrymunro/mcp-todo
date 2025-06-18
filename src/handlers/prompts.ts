import { z } from "zod";
import { getTodosByListId } from "../database/todo.js";
import { getCurrentProject } from "../database/project.js";
import { getAllTodoListsForCurrentProject } from "../database/todo-list.js";
import { GetPromptResult, PromptMessage } from "@modelcontextprotocol/sdk/types.js";

/**
 * Prompt Handler Functions
 * 
 * Implements MCP Prompts for intelligent todo management workflows
 * Provides context-aware prompt templates that leverage existing tools and resources
 */

/**
 * Project Planning Prompt
 * Helps users break down large goals into actionable tasks with priority assignments
 */
export async function handleProjectPlanningPrompt({
  goal,
  timeframe,
  complexity,
}: {
  goal: string;
  timeframe?: string;
  complexity?: "simple" | "moderate" | "complex";
}): Promise<GetPromptResult> {
  try {
    // Get current project context
    const project = await getCurrentProject();
    const todoLists = await getAllTodoListsForCurrentProject();
    const existingTodos = await getTodosByListId();

    const timeframeText = timeframe ? ` within ${timeframe}` : "";
    const complexityLevel = complexity || "moderate";
    
    // Build context about current project state
    let contextText = `Current project: ${project?.name || "Unknown"}\n`;
    contextText += `Existing todo lists: ${todoLists.map(list => list.name).join(", ")}\n`;
    contextText += `Current todos count: ${existingTodos.length}\n\n`;

    const promptText = `${contextText}I want to achieve this goal${timeframeText}: "${goal}"

Please help me break this down into specific, actionable tasks. Consider:

1. **Task Breakdown**: Divide the goal into logical, manageable steps
2. **Priority Assignment**: Suggest which tasks should be high, medium, or low priority
3. **Dependencies**: Identify any tasks that depend on others being completed first
4. **Todo List Organization**: Recommend which todo list(s) to use or if I should create new ones
5. **Complexity Level**: This is a ${complexityLevel} goal, so adjust the granularity accordingly

For each suggested task, provide:
- Clear, actionable task description
- Recommended priority level (high/medium/low)
- Estimated effort or time if relevant
- Any dependencies on other tasks
- Which todo list it should go in

After your analysis, I can use the todo management tools to:
- Create new todo lists with \`todo-list-create\`
- Add tasks with \`todo-write\` or \`todo-write-batch\`
- Set priorities and organize the work`;

    const messages: PromptMessage[] = [
      {
        role: "user",
        content: {
          type: "text",
          text: promptText,
        },
      },
    ];

    return {
      description: "Break down a goal into actionable tasks with priority assignments",
      messages,
    };
  } catch (error) {
    console.error("Error in project planning prompt:", error);
    
    const fallbackText = `I want to achieve this goal${timeframeText}: "${goal}"

Please help me break this down into specific, actionable tasks with priority levels and organization suggestions.`;

    return {
      description: "Break down a goal into actionable tasks with priority assignments",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: fallbackText,
          },
        },
      ],
    };
  }
}

/**
 * Status Review Prompt
 * Generates comprehensive progress reports using current todo data
 */
export async function handleStatusReviewPrompt({
  focus,
  period,
}: {
  focus?: "all" | "high-priority" | "in-progress" | "completed";
  period?: "today" | "week" | "month" | "all-time";
}): Promise<GetPromptResult> {
  try {
    // Get current project context and todos
    const project = await getCurrentProject();
    const todoLists = await getAllTodoListsForCurrentProject();
    const allTodos = await getTodosByListId();

    const focusArea = focus || "all";
    const timePeriod = period || "all-time";

    // Filter todos based on focus
    let filteredTodos = allTodos;
    if (focusArea === "high-priority") {
      filteredTodos = allTodos.filter(todo => todo.priority === "high");
    } else if (focusArea === "in-progress") {
      filteredTodos = allTodos.filter(todo => todo.status === "in_progress");
    } else if (focusArea === "completed") {
      filteredTodos = allTodos.filter(todo => todo.status === "completed");
    }

    // Build detailed context
    const totalTodos = allTodos.length;
    const completedCount = allTodos.filter(todo => todo.status === "completed").length;
    const inProgressCount = allTodos.filter(todo => todo.status === "in_progress").length;
    const pendingCount = allTodos.filter(todo => todo.status === "pending").length;
    const highPriorityCount = allTodos.filter(todo => todo.priority === "high").length;

    let todoDetails = "";
    if (filteredTodos.length > 0) {
      todoDetails = "\n\nCurrent todos:\n" + filteredTodos.map(todo => 
        `- [${todo.status === "completed" ? "✅" : todo.status === "in_progress" ? "⏳" : "🔲"}] ${todo.content} (${todo.priority} priority)`
      ).join("\n");
    }

    const promptText = `# ${project?.name || "Project"} Status Review (${focusArea} focus, ${timePeriod} scope)

## Current Statistics
- **Total todos**: ${totalTodos}
- **Completed**: ${completedCount} (${totalTodos > 0 ? Math.round((completedCount / totalTodos) * 100) : 0}%)
- **In Progress**: ${inProgressCount}
- **Pending**: ${pendingCount}
- **High Priority**: ${highPriorityCount}
- **Todo Lists**: ${todoLists.length} (${todoLists.map(list => list.name).join(", ")})

${todoDetails}

Please provide a comprehensive status review that includes:

1. **Progress Analysis**: Evaluate overall completion rate and velocity
2. **Priority Assessment**: Review high-priority items and their status
3. **Bottleneck Identification**: Spot any tasks that have been pending too long
4. **Achievement Highlights**: Celebrate completed work and milestones
5. **Next Actions**: Recommend what to focus on next
6. **Risk Assessment**: Identify any potential issues or delays
7. **Resource Optimization**: Suggest workflow improvements

Based on this analysis, consider recommending actions using the available tools:
- Update task statuses with \`todo-write\`
- Re-prioritize tasks as needed
- Move tasks between lists with \`todo-list-move-batch\`
- Create new organizational structure with \`todo-list-create\`
- Clean up completed work with \`todo-delete-batch\``;

    const messages: PromptMessage[] = [
      {
        role: "user",
        content: {
          type: "text",
          text: promptText,
        },
      },
    ];

    return {
      description: "Generate a comprehensive progress report from current todo data",
      messages,
    };
  } catch (error) {
    console.error("Error in status review prompt:", error);
    
    const fallbackText = `Please provide a status review of my current project progress, focusing on ${focus || "all areas"} ${period ? `over the ${period}` : ""}.`;

    return {
      description: "Generate a comprehensive progress report from current todo data",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: fallbackText,
          },
        },
      ],
    };
  }
}

/**
 * Task Prioritization Prompt
 * Analyzes pending tasks and suggests priority levels based on various factors
 */
export async function handleTaskPrioritizationPrompt({
  criteria,
  deadline,
}: {
  criteria?: "urgency" | "impact" | "effort" | "dependencies" | "balanced";
  deadline?: string;
}): Promise<GetPromptResult> {
  try {
    // Get pending and in-progress todos
    const allTodos = await getTodosByListId();
    const pendingTodos = allTodos.filter(todo => 
      todo.status === "pending" || todo.status === "in_progress"
    );

    const prioritizationCriteria = criteria || "balanced";
    const deadlineText = deadline ? ` with deadline: ${deadline}` : "";

    let todosList = "";
    if (pendingTodos.length > 0) {
      todosList = "\n\nTasks to prioritize:\n" + pendingTodos.map((todo, index) => 
        `${index + 1}. ${todo.content} (currently ${todo.priority} priority, ${todo.status})`
      ).join("\n");
    } else {
      todosList = "\n\nNo pending tasks found to prioritize.";
    }

    const promptText = `# Task Prioritization Analysis${deadlineText}

## Current Tasks
${pendingTodos.length} tasks need prioritization review using **${prioritizationCriteria}** criteria.
${todosList}

Please analyze these tasks and provide prioritization recommendations based on:

**${prioritizationCriteria.charAt(0).toUpperCase() + prioritizationCriteria.slice(1)} Criteria:**
${criteria === "urgency" ? "- Time sensitivity and deadlines\n- Immediate impact of delays\n- External dependencies and commitments" :
  criteria === "impact" ? "- Business or project value\n- Long-term benefits\n- Strategic importance" :
  criteria === "effort" ? "- Time and resource requirements\n- Complexity and risk\n- Quick wins vs. major undertakings" :
  criteria === "dependencies" ? "- Tasks that block other work\n- Prerequisites and sequencing\n- Resource constraints" :
  "- Balanced assessment of urgency, impact, effort, and dependencies\n- Overall project health and momentum\n- Risk mitigation and opportunity maximization"}

For each task, please provide:

1. **Recommended Priority**: High, Medium, or Low
2. **Reasoning**: Why this priority level is appropriate
3. **Sequencing**: Suggested order within the priority level
4. **Action Items**: Any preparation needed before starting
5. **Risk Factors**: Potential issues to watch for

${deadline ? `\n**Special Consideration**: Factor in the ${deadline} deadline when making recommendations.\n` : ""}

After your analysis, I can implement the changes using:
- \`todo-write\` to update individual task priorities
- \`todo-write-batch\` to update multiple tasks at once
- \`todo-list-move-batch\` to reorganize tasks across lists`;

    const messages: PromptMessage[] = [
      {
        role: "user",
        content: {
          type: "text",
          text: promptText,
        },
      },
    ];

    return {
      description: "Analyze pending tasks and suggest priority levels based on various criteria",
      messages,
    };
  } catch (error) {
    console.error("Error in task prioritization prompt:", error);
    
    const fallbackText = `Please help me prioritize my pending tasks using ${criteria || "balanced"} criteria${deadlineText}.`;

    return {
      description: "Analyze pending tasks and suggest priority levels based on various criteria",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: fallbackText,
          },
        },
      ],
    };
  }
}

/**
 * Sprint Planning Prompt
 * Creates focused work sessions from existing todos
 */
export async function handleSprintPlanningPrompt({
  duration,
  capacity,
  focus_area,
}: {
  duration?: string;
  capacity?: "light" | "normal" | "heavy";
  focus_area?: string;
}): Promise<GetPromptResult> {
  try {
    // Get current project state
    const project = await getCurrentProject();
    const allTodos = await getTodosByListId();
    const todoLists = await getAllTodoListsForCurrentProject();
    
    const sprintDuration = duration || "1 week";
    const workCapacity = capacity || "normal";
    const focusArea = focus_area || "balanced progress";

    // Categorize todos by status and priority
    const highPriorityTodos = allTodos.filter(todo => 
      todo.priority === "high" && (todo.status === "pending" || todo.status === "in_progress")
    );
    const availableTodos = allTodos.filter(todo => 
      todo.status === "pending" || todo.status === "in_progress"
    );

    let todosByPriority = "";
    if (availableTodos.length > 0) {
      const high = availableTodos.filter(t => t.priority === "high");
      const medium = availableTodos.filter(t => t.priority === "medium");
      const low = availableTodos.filter(t => t.priority === "low");
      
      todosByPriority = `\n\n**Available Tasks:**
High Priority (${high.length}):
${high.map(t => `- ${t.content}`).join("\n") || "None"}

Medium Priority (${medium.length}):
${medium.map(t => `- ${t.content}`).join("\n") || "None"}

Low Priority (${low.length}):
${low.map(t => `- ${t.content}`).join("\n") || "None"}`;
    }

    const promptText = `# Sprint Planning for ${project?.name || "Project"}

## Sprint Parameters
- **Duration**: ${sprintDuration}
- **Capacity**: ${workCapacity} workload
- **Focus Area**: ${focusArea}
- **Available Todo Lists**: ${todoLists.map(list => list.name).join(", ")}

## Current Backlog
Total available tasks: ${availableTodos.length}
High priority items: ${highPriorityTodos.length}
${todosByPriority}

Please help me plan an effective sprint that includes:

1. **Sprint Goal**: Define a clear, achievable objective for this sprint
2. **Task Selection**: Choose appropriate tasks based on:
   - Priority levels and dependencies
   - ${workCapacity} capacity constraints
   - ${focusArea} focus
   - ${sprintDuration} timeframe

3. **Sprint Backlog**: Recommend specific tasks to include with:
   - Rationale for inclusion
   - Suggested execution order
   - Estimated effort or time allocation
   - Risk mitigation strategies

4. **Success Metrics**: Define how to measure sprint success
5. **Daily Focus**: Suggest daily or weekly focus areas within the sprint
6. **Contingency Planning**: Backup tasks if primary work completes early

**Capacity Guidelines for ${workCapacity} workload:**
${capacity === "light" ? "- Focus on 3-5 small tasks or 1-2 medium tasks\n- Prioritize learning and sustainable pace\n- Allow buffer time for unexpected work" :
  capacity === "heavy" ? "- Aggressive timeline with 8-12 tasks or 3-4 major items\n- High-intensity focus with minimal context switching\n- Require strong time management and minimal interruptions" :
  "- Balanced approach with 5-8 tasks of mixed sizes\n- Good mix of challenging and routine work\n- Sustainable pace with moderate stretch goals"}

After planning, I can execute using:
- \`todo-write\` to update task statuses as work begins
- \`todo-list-create\` to create a dedicated sprint list if needed
- \`todo-list-move-batch\` to organize sprint tasks
- \`todo-write-batch\` to batch-update task information`;

    const messages: PromptMessage[] = [
      {
        role: "user",
        content: {
          type: "text",
          text: promptText,
        },
      },
    ];

    return {
      description: "Plan a focused work sprint from your available tasks and capacity",
      messages,
    };
  } catch (error) {
    console.error("Error in sprint planning prompt:", error);
    
    const fallbackText = `Please help me plan a ${duration || "1 week"} sprint with ${capacity || "normal"} capacity, focusing on ${focus_area || "balanced progress"}.`;

    return {
      description: "Plan a focused work sprint from your available tasks and capacity",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: fallbackText,
          },
        },
      ],
    };
  }
}

/**
 * Cleanup Suggestions Prompt
 * Recommends todos to archive or delete based on patterns and age
 */
export async function handleCleanupSuggestionsPrompt({
  age_threshold,
  include_completed,
}: {
  age_threshold?: string;
  include_completed?: boolean;
}): Promise<GetPromptResult> {
  try {
    // Get all todos and analyze patterns
    const allTodos = await getTodosByListId();
    const project = await getCurrentProject();
    
    const ageThreshold = age_threshold || "30 days";
    const shouldIncludeCompleted = include_completed ?? true;

    // Categorize todos for analysis
    const completedTodos = allTodos.filter(todo => todo.status === "completed");
    const pendingTodos = allTodos.filter(todo => todo.status === "pending");
    const inProgressTodos = allTodos.filter(todo => todo.status === "in_progress");
    
    // Calculate age-based recommendations (simplified - in real implementation, would use actual dates)
    const oldTodos = allTodos.filter(todo => {
      // This is a simplified check - in reality you'd compare with actual creation dates
      return todo.status === "pending" && todo.content.length > 100; // Placeholder logic
    });

    let cleanupAnalysis = `\n\n**Cleanup Analysis:**
Total todos: ${allTodos.length}
- Completed: ${completedTodos.length}
- Pending: ${pendingTodos.length}
- In Progress: ${inProgressTodos.length}
- Potentially stale: ${oldTodos.length}`;

    if (completedTodos.length > 0 && shouldIncludeCompleted) {
      cleanupAnalysis += `\n\n**Completed Tasks:**
${completedTodos.slice(0, 10).map(todo => `- ✅ ${todo.content}`).join("\n")}
${completedTodos.length > 10 ? `... and ${completedTodos.length - 10} more` : ""}`;
    }

    if (oldTodos.length > 0) {
      cleanupAnalysis += `\n\n**Potentially Stale Tasks:**
${oldTodos.slice(0, 5).map(todo => `- 🔲 ${todo.content} (${todo.priority} priority)`).join("\n")}
${oldTodos.length > 5 ? `... and ${oldTodos.length - 5} more` : ""}`;
    }

    const promptText = `# ${project?.name || "Project"} Cleanup Recommendations

## Cleanup Parameters
- **Age Threshold**: Tasks older than ${ageThreshold}
- **Include Completed**: ${shouldIncludeCompleted ? "Yes" : "No"}
- **Total Tasks**: ${allTodos.length}

${cleanupAnalysis}

Please analyze my todo list and provide cleanup recommendations:

1. **Completed Task Cleanup**:
   ${shouldIncludeCompleted ? 
     `- Review ${completedTodos.length} completed tasks for archival
   - Identify tasks that can be safely deleted
   - Suggest which completed tasks to keep as reference` :
     "- (Completed tasks excluded from this analysis)"}

2. **Stale Task Review**:
   - Identify tasks that may no longer be relevant
   - Suggest updates to make old tasks actionable again
   - Recommend tasks to delete vs. update vs. re-prioritize

3. **Organization Improvements**:
   - Suggest consolidation opportunities
   - Identify duplicate or similar tasks
   - Recommend better task descriptions or breakdowns

4. **Priority Cleanup**:
   - Review priority assignments for consistency
   - Identify high-priority tasks that may no longer be urgent
   - Suggest priority rebalancing

5. **List Organization**:
   - Recommend todo list restructuring if needed
   - Suggest archival lists for completed work
   - Identify opportunities for better categorization

For each recommendation, provide:
- **Action Type**: Delete, Archive, Update, or Reorganize
- **Specific Tasks**: Which todos are affected
- **Rationale**: Why this action is recommended
- **Risk Assessment**: What might be lost and mitigation strategies

After review, implement changes using:
- \`todo-delete-batch\` for bulk deletions
- \`todo-write-batch\` for bulk updates
- \`todo-list-create\` for archive lists
- \`todo-list-move-batch\` for reorganization`;

    const messages: PromptMessage[] = [
      {
        role: "user",
        content: {
          type: "text",
          text: promptText,
        },
      },
    ];

    return {
      description: "Analyze todo list for cleanup opportunities and archival suggestions",
      messages,
    };
  } catch (error) {
    console.error("Error in cleanup suggestions prompt:", error);
    
    const fallbackText = `Please analyze my todo list and suggest cleanup actions for tasks older than ${age_threshold || "30 days"}${include_completed ? ", including completed tasks" : ""}.`;

    return {
      description: "Analyze todo list for cleanup opportunities and archival suggestions",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: fallbackText,
          },
        },
      ],
    };
  }
}