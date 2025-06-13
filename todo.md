# New feature: Projects and Sqlite Persistence

Change the persistence from using json to using sqlite, and change where it persists the db to $XDG_DATA_HOME/mcp-todo/todos.db

## Libraries

Use the following libraries:

- @https://bun.sh/docs/api/sqlite
- @https://orm.drizzle.team/docs/get-started-sqlite
  - @https://orm.drizzle.team/docs/connect-bun-sqlite

## Sqlite Tables

Create 4 tables to begin with:

1. project
2. todo_list
3. todo
4. settings - placeholder key/value store

### Project Table

Project table should have the following attributes/columns:

- id
- name
- location (indexed) - path to the root of a repo/project
- default_todo_list_id - foreign key to todo_list
- updated_at (trigger auto-updated)

### TODO List Table

The todo list table should have the following:

- id
- name
- description (optional)
- num_completed (generated column)
- total_count (generated column)
- updated_at (trigger auto-updated)

### TODO Table

The todo table should have:

- id
- todo_list_id - foreign key to todo_list
- content
- status [completed, pending, in_progress]
- priority [high, medium, low]
- updated_at (trigger auto-updated)

## Initialisation

When the MCP server starts, it should look for a project by its `location`.

If it finds a project, it should keep the default_todo_list_id in memory.
If it does not find a project, it should create a todo_list and a project, saving the todo_list's id in memory.

## Tool Changes

### Updates

The following tools should be updated to take an optional argument of todo_list_id, it should default to the stored in memory todo_list_id:

- todo-read
- todo-write
- todo-list

### New

- project-update - update project's name or default todo_list
- project-get - get the projects details
- todo_list-list - list all the todo_lists
- todo_list-get - get the details of a todo_list by id (or default to the stored in memory list)

## Final Planning Touches

1. Review the requirements and ensure each requirement has been accounted for
2. Anticipate users needs and consider other requirements that may have not been mentioned
3. Reflect on any queries or concerns you may have on the project feature update
4. Add or update your plan to incorporate everything
