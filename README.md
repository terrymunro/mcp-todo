# MCP Todo Server (TypeScript)

This repository contains a fully-featured Todo service that speaks the **Model Context Protocol (MCP)**. It is written in TypeScript and runs on the [Bun](https://bun.sh) runtime with SQLite persistence.

The server exposes ten MCP tools that can be invoked by an AI-agent, CLI, or any other MCP-compatible client:

**Todo Management:**
• **todo-write** – Create a new todo or PATCH an existing one  
• **todo-read** – Fetch a single todo by its id  
• **todo-list** – List todos, ordered by priority _(high → medium → low)_

**Project Management:**
• **project-get** – Get current project details
• **project-update** – Update project name or default todo list

**Todo List Management:**
• **todo-list-list** – List all todo lists for the current project
• **todo-list-get** – Get details of a specific todo list
• **todo-list-create** – Create a new todo list
• **todo-list-update** – Update a todo list's name or description
• **todo-list-delete** – Delete a todo list and all its todos

All data is stored in a SQLite database at `$XDG_DATA_HOME/mcp-todo/todos.db` (or `~/.local/share/mcp-todo/todos.db`) with automatic project detection based on your current working directory.

---

## Quick start

Prerequisite: **Bun ≥ 1.0** must be installed (see https://bun.sh).

```bash
# 1. Install dependencies
bun install

# 2. Start the server (prints to STDIO)
bun run index.ts            # or: bun start
```

When the server starts you will see:

```
Data directory ensured at: ~/.local/share/mcp-todo
Initializing database at: ~/.local/share/mcp-todo/todos.db
No project found for location: /current/working/directory
Creating new project with default todo list...
Created project "project-name" with default todo list
Using default todo list ID: 1
Starting MCP Todo Server...
MCP Todo Server is running.
Available tools: todo-write, todo-read, todo-list, project-get, project-update, todo-list-list, todo-list-get, todo-list-create, todo-list-update, todo-list-delete
```

The server uses STDIO as its transport, so a client just needs to speak MCP over stdin/stdout in the same process. (See the `@modelcontextprotocol/sdk` for client helpers.)

---

## Example tool calls

Most MCP clients send JSON that matches the tool schema. Below are raw argument examples; wrapping them in an MCP envelope is the client’s responsibility.

### Todo Management

1. **Create** a new todo:

```jsonc
{
  "id": 1,
  "content": "Write a great README",
  "priority": "high",
}
```

2. **Update** only the status of that todo (PATCH):

```jsonc
{
  "id": 1,
  "status": "completed",
}
```

3. **List** todos in the default todo list:

```json
{}
```

4. **Read** a specific todo:

```jsonc
{
  "id": 1,
}
```

### Project Management

5. **Get** current project details:

```json
{}
```

6. **Update** project name:

```jsonc
{
  "name": "My Updated Project",
}
```

### Todo List Management

7. **List** all todo lists for the current project:

```json
{}
```

8. **Create** a new todo list:

```jsonc
{
  "name": "Shopping List",
  "description": "Items to buy at the store",
}
```

9. **Get** details of a specific todo list:

```jsonc
{
  "id": 2,
}
```

10. **Update** a todo list:

```jsonc
{
  "id": 2,
  "name": "Updated Shopping List",
  "description": "Updated description",
}
```

11. **Delete** a todo list:

```jsonc
{
  "id": 2,
}
```

---

## Running the test-suite

The project uses Bun’s built-in test runner and a fully mocked file-system for fast, side-effect-free tests.

```bash
# One-off run
bun test

# Watch mode (reruns on file save)
bun test --watch
```

---

## Useful npm scripts

• `bun run start` – alias for `bun run index.ts`  
• `bun run typecheck` – compile with TypeScript (`tsc`) with `--noEmit`  
• `bun test` / `bun test --watch` – run tests

---

## Project layout

```
.                       # repo root
├── index.ts            # MCP server & tool definitions
├── database.ts         # SQLite database functions
├── schema.ts           # Drizzle ORM schema definitions
├── simple.test.ts      # Database schema tests
├── tools-simple.test.ts # Tool handler tests
├── integration.test.ts  # End-to-end integration tests
├── storage.test.ts     # Legacy test placeholder
├── CLAUDE.md           # Project-specific instructions
└── ...                 # config, docs, etc.
```

### Database

Data is stored in a SQLite database at:

- `$XDG_DATA_HOME/mcp-todo/todos.db` (Linux/Unix)
- `~/.local/share/mcp-todo/todos.db` (fallback)

The database contains four tables:

- **project** - Auto-detected projects by directory location
- **todo_list** - Multiple todo lists per project
- **todo** - Individual todo items
- **settings** - Key/value configuration store

## Features

- **Project Auto-Detection**: Automatically creates/detects projects based on current working directory
- **Multiple Todo Lists**: Support for multiple organized todo lists per project
- **PATCH Operations**: Partial updates for todos (update only the fields you want to change)
- **Priority Sorting**: Automatic sorting by priority (high → medium → low)
- **XDG Compliance**: Follows Linux/Unix standards for data directory location
- **Type Safety**: Full TypeScript typing with Zod validation
- **Comprehensive Testing**: Unit, integration, and tool handler tests
- **SQLite Persistence**: Reliable database storage with automatic schema management

## Architecture

Built using:

- **Bun** - JavaScript runtime and package manager
- **TypeScript** - Type-safe JavaScript
- **SQLite** - Embedded database via Bun's built-in SQLite
- **Drizzle ORM** - Type-safe database toolkit
- **Zod** - Runtime type validation
- **Model Context Protocol (MCP)** - Communication protocol for AI tools

---

## License

This proof-of-concept is published without any particular license. Treat it as public domain unless a license file is later added.
