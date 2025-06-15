import * as path from "path";
import { defineConfig } from "drizzle-kit";

// Replicate the XDG data directory logic for drizzle-kit config
function getDataDirectory(): string {
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

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  // @ts-ignore - Drizzle-kit sqlite dialect type definitions may be inconsistent
  dialect: "sqlite",
  dbCredentials: {
    // @ts-ignore - url property for sqlite is valid but types may be wrong
    url: path.join(getDataDirectory(), "todos.db"),
  },
  verbose: true,
  strict: true,
});