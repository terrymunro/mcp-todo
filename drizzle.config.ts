import { defineConfig } from 'drizzle-kit';
import * as path from 'path';

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
  schema: './schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: path.join(getDataDirectory(), 'todos.db'),
  },
  verbose: true,
  strict: true,
});