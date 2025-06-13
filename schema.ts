import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Project table
export const project = sqliteTable(
  "project",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    location: text("location").notNull(), // path to the root of repo/project
    default_todo_list_id: integer("default_todo_list_id").references(() => todoList.id),
    updated_at: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    locationIdx: index("location_idx").on(table.location),
  })
);

// Todo List table
export const todoList = sqliteTable("todo_list", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  // Note: Generated columns for stats will be computed in queries for now
  // num_completed and total_count will be calculated dynamically
  updated_at: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

// Todo table
export const todo = sqliteTable("todo", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  todo_list_id: integer("todo_list_id").notNull().references(() => todoList.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  status: text("status").notNull().default("pending"), // 'completed', 'pending', 'in_progress'
  priority: text("priority").notNull().default("medium"), // 'high', 'medium', 'low'
  updated_at: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

// Settings table - key/value store for future features
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Triggers to auto-update timestamps
export const createTriggers = [
  `CREATE TRIGGER IF NOT EXISTS update_project_timestamp
    AFTER UPDATE ON project
    BEGIN
      UPDATE project SET updated_at = unixepoch() WHERE id = NEW.id;
    END;`,
  `CREATE TRIGGER IF NOT EXISTS update_todo_list_timestamp
    AFTER UPDATE ON todo_list
    BEGIN
      UPDATE todo_list SET updated_at = unixepoch() WHERE id = NEW.id;
    END;`,
  `CREATE TRIGGER IF NOT EXISTS update_todo_timestamp
    AFTER UPDATE ON todo
    BEGIN
      UPDATE todo SET updated_at = unixepoch() WHERE id = NEW.id;
    END;`,
  `CREATE TRIGGER IF NOT EXISTS update_todo_list_on_todo_insert
    AFTER INSERT ON todo
    BEGIN
      UPDATE todo_list SET updated_at = unixepoch() 
      WHERE id = NEW.todo_list_id;
    END;`,
  `CREATE TRIGGER IF NOT EXISTS update_todo_list_on_todo_update
    AFTER UPDATE ON todo
    BEGIN
      UPDATE todo_list SET updated_at = unixepoch() 
      WHERE id = NEW.todo_list_id;
    END;`,
  `CREATE TRIGGER IF NOT EXISTS update_todo_list_on_todo_delete
    AFTER DELETE ON todo
    BEGIN
      UPDATE todo_list SET updated_at = unixepoch() 
      WHERE id = OLD.todo_list_id;
    END;`,
];

// Export types
export type Project = typeof project.$inferSelect;
export type NewProject = typeof project.$inferInsert;
export type TodoList = typeof todoList.$inferSelect;
export type NewTodoList = typeof todoList.$inferInsert;
export type Todo = typeof todo.$inferSelect;
export type NewTodo = typeof todo.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;