CREATE TABLE `project` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`default_todo_list_id` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `todo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`todo_list_id` integer NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `todo_list` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`num_completed` integer,
	`total_count` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `location_idx` ON `project` (`location`);
--> statement-breakpoint

-- Triggers for automatic timestamp updates
CREATE TRIGGER IF NOT EXISTS update_project_timestamp
AFTER UPDATE ON project
BEGIN
  UPDATE project SET updated_at = unixepoch() WHERE id = NEW.id;
END;
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS update_todo_list_timestamp
AFTER UPDATE ON todo_list
BEGIN
  UPDATE todo_list SET updated_at = unixepoch() WHERE id = NEW.id;
END;
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS update_todo_timestamp
AFTER UPDATE ON todo
BEGIN
  UPDATE todo SET updated_at = unixepoch() WHERE id = NEW.id;
END;
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS update_todo_list_on_todo_insert
AFTER INSERT ON todo
BEGIN
  UPDATE todo_list SET updated_at = unixepoch() 
  WHERE id = NEW.todo_list_id;
END;
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS update_todo_list_on_todo_update
AFTER UPDATE ON todo
BEGIN
  UPDATE todo_list SET updated_at = unixepoch() 
  WHERE id = NEW.todo_list_id;
END;
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS update_todo_list_on_todo_delete
AFTER DELETE ON todo
BEGIN
  UPDATE todo_list SET updated_at = unixepoch() 
  WHERE id = OLD.todo_list_id;
END;
--> statement-breakpoint

-- Triggers for automatic todo list statistics updates
CREATE TRIGGER IF NOT EXISTS update_todo_list_stats_on_insert
AFTER INSERT ON todo
BEGIN
  UPDATE todo_list SET 
    num_completed = (SELECT COUNT(*) FROM todo WHERE todo_list_id = NEW.todo_list_id AND status = 'completed'),
    total_count = (SELECT COUNT(*) FROM todo WHERE todo_list_id = NEW.todo_list_id)
  WHERE id = NEW.todo_list_id;
END;
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS update_todo_list_stats_on_update
AFTER UPDATE ON todo
BEGIN
  UPDATE todo_list SET 
    num_completed = (SELECT COUNT(*) FROM todo WHERE todo_list_id = NEW.todo_list_id AND status = 'completed'),
    total_count = (SELECT COUNT(*) FROM todo WHERE todo_list_id = NEW.todo_list_id)
  WHERE id = NEW.todo_list_id;
END;
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS update_todo_list_stats_on_delete
AFTER DELETE ON todo
BEGIN
  UPDATE todo_list SET 
    num_completed = (SELECT COUNT(*) FROM todo WHERE todo_list_id = OLD.todo_list_id AND status = 'completed'),
    total_count = (SELECT COUNT(*) FROM todo WHERE todo_list_id = OLD.todo_list_id)
  WHERE id = OLD.todo_list_id;
END;