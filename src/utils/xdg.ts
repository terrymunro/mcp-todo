import * as path from "path";
import * as fs from "fs/promises";

/**
 * XDG Directory Utilities
 * 
 * Handles XDG Base Directory specification for data storage
 */

/**
 * Resolves the XDG data directory path for storing the SQLite database
 * Uses $XDG_DATA_HOME if set, otherwise falls back to ~/.local/share
 * 
 * @returns Path to the data directory
 * @throws Error if unable to determine home directory
 */
export function getDataDirectory(): string {
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

/**
 * Gets the full path to the SQLite database file
 * 
 * @returns Path to the database file
 */
export function getDatabasePath(): string {
  return path.join(getDataDirectory(), "todos.db");
}

/**
 * Ensures the data directory exists, creating it if necessary
 * 
 * @throws Error if directory creation fails
 */
export async function ensureDataDirectoryExists(): Promise<void> {
  const dataDir = getDataDirectory();

  try {
    await fs.mkdir(dataDir, { recursive: true });
    console.log(`Data directory ensured at: ${dataDir}`);
  } catch (error) {
    console.error("Error creating data directory:", error);
    throw error;
  }
}