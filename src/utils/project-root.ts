import * as fs from "fs/promises";
import * as path from "path";

/**
 * Project Root Detection Utilities
 * 
 * Walks up the directory tree to find project root indicators
 */

/**
 * Common project root indicators in order of preference
 */
const PROJECT_INDICATORS = [
  ".git",           // Git repository
  "package.json",   // Node.js/npm project
  "Cargo.toml",     // Rust project
  "pyproject.toml", // Python project (modern)
  "setup.py",       // Python project (legacy)
  "go.mod",         // Go project
  "Makefile",       // Various projects with Makefile
  ".project",       // Eclipse/IDE project
  "composer.json",  // PHP project
  "pom.xml",        // Maven/Java project
  "build.gradle",   // Gradle project
  "CMakeLists.txt", // CMake project
] as const;

/**
 * Finds the project root by walking up the directory tree looking for common project indicators.
 * Returns the project root path, or falls back to the current working directory if no indicators are found.
 * 
 * @param startPath - Starting directory path (defaults to current working directory)
 * @returns Promise resolving to the project root path
 */
export async function findProjectRoot(startPath?: string): Promise<string> {
  const start = startPath || process.cwd();
  let currentPath = path.resolve(start);
  
  while (true) {
    // Check for any project indicators in current directory
    for (const indicator of PROJECT_INDICATORS) {
      const indicatorPath = path.join(currentPath, indicator);
      try {
        await fs.access(indicatorPath);
        // Found a project indicator, this is our project root
        console.log(`Found project root at: ${currentPath} (indicator: ${indicator})`);
        return currentPath;
      } catch {
        // Indicator not found, continue checking
      }
    }
    
    // Move up one directory
    const parentPath = path.dirname(currentPath);
    
    // If we've reached the filesystem root, stop and use the original start path
    if (parentPath === currentPath) {
      console.log(`No project root found, using current directory: ${start}`);
      return start;
    }
    
    currentPath = parentPath;
  }
}

/**
 * Checks if a directory contains any project indicators
 * 
 * @param dirPath - Directory path to check
 * @returns Promise resolving to the first found indicator, or null if none found
 */
export async function findProjectIndicator(dirPath: string): Promise<string | null> {
  for (const indicator of PROJECT_INDICATORS) {
    const indicatorPath = path.join(dirPath, indicator);
    try {
      await fs.access(indicatorPath);
      return indicator;
    } catch {
      // Continue checking
    }
  }
  return null;
}