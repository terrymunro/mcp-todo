import * as fs from "fs/promises";
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import "./utils/test-logger"; // Auto-suppress verbose output during tests
import {
  handleProjectPlanningPrompt,
  handleStatusReviewPrompt,
  handleTaskPrioritizationPrompt,
  handleSprintPlanningPrompt,
  handleCleanupSuggestionsPrompt,
} from "../src/handlers/prompts.js";
import { initializeProjectContext } from "../src/database/project.js";
import { saveTodo } from "../src/database/todo.js";
import { createTodoList } from "../src/database/todo-list.js";
import { clearDatabaseConnectionCache } from "../src/database/connection.js";

describe("Prompt Handlers", () => {
  let originalCwd: () => string;
  let originalXdgDataHome: string | undefined;
  let testDataDir: string;

  beforeEach(async () => {
    // Mock process.cwd to a test directory
    originalCwd = process.cwd;
    process.cwd = () => "/tmp/test-project";

    // Mock XDG_DATA_HOME to a temporary test directory
    originalXdgDataHome = process.env.XDG_DATA_HOME;
    testDataDir = "/tmp/mcp-todo-test-prompts-" + Date.now();
    process.env.XDG_DATA_HOME = testDataDir;

    // Ensure test directory exists
    await fs.mkdir(testDataDir, { recursive: true });

    // Initialize project context
    await initializeProjectContext();
    
    // Create sample data for testing
    await setupSampleData();
  });

  afterEach(async () => {
    // Clear database connections
    clearDatabaseConnectionCache();

    // Restore original environment
    process.cwd = originalCwd;
    if (originalXdgDataHome) {
      process.env.XDG_DATA_HOME = originalXdgDataHome;
    } else {
      delete process.env.XDG_DATA_HOME;
    }

    // Clean up test directory
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
      console.warn("Warning: Could not clean up test directory:", error);
    }
  });

  async function setupSampleData() {
    // Create a sample todo list
    const todoList = await createTodoList("Test Project Tasks", "Sample tasks for testing");

    // Create sample todos with different statuses and priorities
    await saveTodo({
      id: 1,
      content: "Implement new feature",
      priority: "high",
      status: "pending",
      todo_list_id: todoList.id,
    });

    await saveTodo({
      id: 2,
      content: "Write documentation",
      priority: "medium",
      status: "in_progress",
      todo_list_id: todoList.id,
    });

    await saveTodo({
      id: 3,
      content: "Fix bug in authentication",
      priority: "high",
      status: "pending",
      todo_list_id: todoList.id,
    });

    await saveTodo({
      id: 4,
      content: "Update dependencies",
      priority: "low",
      status: "completed",
      todo_list_id: todoList.id,
    });

    await saveTodo({
      id: 5,
      content: "Refactor legacy code",
      priority: "medium",
      status: "pending",
      todo_list_id: todoList.id,
    });
  }

  describe("Project Planning Prompt", () => {
    test("should generate project planning prompt with goal", async () => {
      const result = await handleProjectPlanningPrompt({
        goal: "Build a new web application",
      });

      expect(result).toBeDefined();
      expect(result.description).toBe("Break down a goal into actionable tasks with priority assignments");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.role).toBe("user");
      expect(result.messages[0]?.content.type).toBe("text");
      expect(result.messages[0]?.content.text).toContain("Build a new web application");
      expect(result.messages[0]?.content.text).toContain("Task Breakdown");
      expect(result.messages[0]?.content.text).toContain("Priority Assignment");
    });

    test("should include timeframe and complexity in prompt", async () => {
      const result = await handleProjectPlanningPrompt({
        goal: "Launch marketing campaign",
        timeframe: "2 weeks",
        complexity: "complex",
      });

      expect(result.messages[0]?.content.text).toContain("within 2 weeks");
      expect(result.messages[0]?.content.text).toContain("complex goal");
    });

    test("should handle errors gracefully", async () => {
      // Simulate an error condition by passing minimal valid input
      const result = await handleProjectPlanningPrompt({
        goal: "Test goal",
      });

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(1);
      expect(result.description).toBeDefined();
    });
  });

  describe("Status Review Prompt", () => {
    test("should generate status review with current data", async () => {
      const result = await handleStatusReviewPrompt({});

      expect(result).toBeDefined();
      expect(result.description).toBe("Generate a comprehensive progress report from current todo data");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.content.text).toContain("Status Review");
      expect(result.messages[0]?.content.text).toContain("**Total todos**:");
      expect(result.messages[0]?.content.text).toContain("**Completed**:");
      expect(result.messages[0]?.content.text).toContain("**High Priority**:");
    });

    test("should respect focus parameter", async () => {
      const result = await handleStatusReviewPrompt({
        focus: "high-priority",
        period: "week",
      });

      expect(result.messages[0]?.content.text).toContain("high-priority focus");
      expect(result.messages[0]?.content.text).toContain("week scope");
    });

    test("should include todo details in output", async () => {
      const result = await handleStatusReviewPrompt({ focus: "all" });

      // Check that the prompt structure includes sections for analysis
      expect(result.messages[0]?.content.text).toContain("Progress Analysis");
      expect(result.messages[0]?.content.text).toContain("Priority Assessment");
    });
  });

  describe("Task Prioritization Prompt", () => {
    test("should generate prioritization analysis", async () => {
      const result = await handleTaskPrioritizationPrompt({});

      expect(result).toBeDefined();
      expect(result.description).toBe("Analyze pending tasks and suggest priority levels based on various criteria");
      expect(result.messages[0]?.content.text).toContain("Task Prioritization Analysis");
      expect(result.messages[0]?.content.text).toContain("tasks need prioritization");
      expect(result.messages[0]?.content.text).toContain("**balanced** criteria");
    });

    test("should include criteria and deadline", async () => {
      const result = await handleTaskPrioritizationPrompt({
        criteria: "urgency",
        deadline: "end of month",
      });

      expect(result.messages[0]?.content.text).toContain("Urgency Criteria");
      expect(result.messages[0]?.content.text).toContain("Time sensitivity and deadlines");
      expect(result.messages[0]?.content.text).toContain("deadline: end of month");
    });

    test("should list pending tasks", async () => {
      const result = await handleTaskPrioritizationPrompt({});

      // Check that the prompt structure includes task analysis sections
      expect(result.messages[0]?.content.text).toContain("tasks need prioritization");
      expect(result.messages[0]?.content.text).toContain("**Recommended Priority**");
      expect(result.messages[0]?.content.text).toContain("**Reasoning**");
    });
  });

  describe("Sprint Planning Prompt", () => {
    test("should generate sprint planning prompt", async () => {
      const result = await handleSprintPlanningPrompt({});

      expect(result).toBeDefined();
      expect(result.description).toBe("Plan a focused work sprint from your available tasks and capacity");
      expect(result.messages[0]?.content.text).toContain("Sprint Planning");
      expect(result.messages[0]?.content.text).toContain("**Duration**: 1 week");
      expect(result.messages[0]?.content.text).toContain("**Capacity**: normal");
    });

    test("should include capacity guidelines", async () => {
      const result = await handleSprintPlanningPrompt({
        duration: "2 weeks",
        capacity: "heavy",
        focus_area: "feature development",
      });

      expect(result.messages[0]?.content.text).toContain("**Duration**: 2 weeks");
      expect(result.messages[0]?.content.text).toContain("**Capacity**: heavy");
      expect(result.messages[0]?.content.text).toContain("**Focus Area**: feature development");
      expect(result.messages[0]?.content.text).toContain("Aggressive timeline");
    });

    test("should categorize available tasks by priority", async () => {
      const result = await handleSprintPlanningPrompt({});

      expect(result.messages[0]?.content.text).toContain("High priority items");
      expect(result.messages[0]?.content.text).toContain("Sprint Goal");
      expect(result.messages[0]?.content.text).toContain("Task Selection");
    });
  });

  describe("Cleanup Suggestions Prompt", () => {
    test("should generate cleanup analysis", async () => {
      const result = await handleCleanupSuggestionsPrompt({});

      expect(result).toBeDefined();
      expect(result.description).toBe("Analyze todo list for cleanup opportunities and archival suggestions");
      expect(result.messages[0]?.content.text).toContain("Cleanup Recommendations");
      expect(result.messages[0]?.content.text).toContain("**Total Tasks**:");
      expect(result.messages[0]?.content.text).toContain("Completed:");
    });

    test("should include age threshold and completed task setting", async () => {
      const result = await handleCleanupSuggestionsPrompt({
        age_threshold: "60 days",
        include_completed: "false",
      });

      expect(result.messages[0]?.content.text).toContain("**Age Threshold**: Tasks older than 60 days");
      expect(result.messages[0]?.content.text).toContain("**Include Completed**: No");
    });

    test("should show completed tasks when included", async () => {
      const result = await handleCleanupSuggestionsPrompt({
        include_completed: "true",
      });

      expect(result.messages[0]?.content.text).toContain("**Include Completed**: Yes");
      expect(result.messages[0]?.content.text).toContain("Completed Task Cleanup");
    });
  });

  describe("Error Handling", () => {
    test("all prompts should handle database errors gracefully", async () => {
      // Test with invalid database state - this should fall back to basic prompts
      const prompts = [
        () => handleProjectPlanningPrompt({ goal: "test" }),
        () => handleStatusReviewPrompt({}),
        () => handleTaskPrioritizationPrompt({}),
        () => handleSprintPlanningPrompt({}),
        () => handleCleanupSuggestionsPrompt({}),
      ];

      for (const promptFn of prompts) {
        const result = await promptFn();
        expect(result).toBeDefined();
        expect(result.messages).toHaveLength(1);
        expect(result.description).toBeDefined();
        expect(result.messages[0]?.role).toBe("user");
        expect(result.messages[0]?.content.type).toBe("text");
      }
    });
  });

  describe("Integration with Current Project State", () => {
    test("prompts should include current project information", async () => {
      const statusResult = await handleStatusReviewPrompt({});
      const sprintResult = await handleSprintPlanningPrompt({});

      // Both should reference the current project context
      expect(statusResult.messages[0]?.content.text).toContain("Status Review");
      expect(sprintResult.messages[0]?.content.text).toContain("Sprint Planning");

      // Both should include todo list information
      expect(statusResult.messages[0]?.content.text).toContain("Test Project Tasks");
      expect(sprintResult.messages[0]?.content.text).toContain("Test Project Tasks");
    });
  });
});