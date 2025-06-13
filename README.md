# MCP Todo Server (TypeScript)

This repository contains a very small but fully-tested proof-of-concept Todo service that speaks the **Model Context Protocol (MCP)**.  It is written in TypeScript and runs on the [Bun](https://bun.sh) runtime.

The server exposes three MCP tools that can be invoked by an AI-agent, CLI, or any other MCP-compatible client:

• **todo-write** – Create a new todo or PATCH an existing one  
• **todo-read**  – Fetch a single todo by its id  
• **todo-list**  – List every todo, ordered by priority *(high → medium → low)*

Todos are stored on disk as simple JSON files inside the `./todos/` directory and validated using [Zod](https://github.com/colinhacks/zod).

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
Starting MCP Todo Server...
MCP Todo Server is running.
Available tools: todo-write, todo-read, todo-list
```

The server uses STDIO as its transport, so a client just needs to speak MCP over stdin/stdout in the same process.  (See the `@modelcontextprotocol/sdk` for client helpers.)

---

## Example tool calls

Most MCP clients send JSON that matches the tool schema.  Below are raw argument examples; wrapping them in an MCP envelope is the client’s responsibility.

1. **Create** a new todo (id = 1):

```jsonc
{
  "id": 1,
  "content": "Write a great README",
  "priority": "high"
}
```

2. **Update** only the status of that todo:

```jsonc
{
  "id": 1,
  "status": "completed"
}
```

3. **List** every todo (no parameters required):

```json
{}
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
.                 # repo root
├── index.ts      # application & tool definitions
├── todos/        # JSON files will be created here at runtime
├── storage.test.ts
└── ...           # config, docs, etc.
```

---

## License

This proof-of-concept is published without any particular license.  Treat it as public domain unless a license file is later added.
