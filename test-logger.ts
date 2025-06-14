// Detects if we're running in a test environment
export function isTestEnvironment(): boolean {
  return (
    typeof globalThis.Bun !== "undefined" &&
    typeof globalThis.Bun.jest !== "undefined"
  ) ||
  process.env.NODE_ENV === "test" ||
  process.argv.some(arg => arg.includes("test"));
}

// Simple test logger that suppresses verbose output during tests
class TestLogger {
  private logBuffer: string[] = [];
  private originalConsole: {
    log: typeof console.log;
    error: typeof console.error;
    warn: typeof console.warn;
  };

  constructor() {
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
    };
  }

  suppressVerboseLogs() {
    // Messages to suppress during tests
    const suppressedPatterns = [
      /^Data directory ensured at:/,
      /^Initializing database at:/,
      /^Migrations applied successfully/,
      /^Found project root at:/,
      /^No project root found, using current directory:/,
      /^Creating schema manually as fallback/,
      /^Migrations folder not found or migration failed/,
    ];

    console.log = (...args: any[]) => {
      const message = this.formatArgs(args);
      const shouldSuppress = suppressedPatterns.some(pattern => pattern.test(message));
      
      if (!shouldSuppress) {
        this.originalConsole.log(...args);
      }
    };

    console.error = (...args: any[]) => {
      const message = this.formatArgs(args);
      
      // Suppress expected test errors and migration errors
      const suppressedErrorPatterns = [
        /Error in Todo.*handler:/,                    // Expected test errors
        /Error applying migrations:/,                 // Migration errors
        /DrizzleError: Failed to run the query/,      // Drizzle migration errors
        /SQLiteError: table.*already exists/,         // Table already exists errors
      ];
      
      const shouldSuppress = suppressedErrorPatterns.some(pattern => pattern.test(message));
      if (shouldSuppress) {
        return;
      }
      
      this.originalConsole.error(...args);
    };

    console.warn = (...args: any[]) => {
      this.originalConsole.warn(...args);
    };
  }

  restore() {
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
  }

  private formatArgs(args: any[]): string {
    return args
      .map((arg) =>
        typeof arg === "object" && arg !== null
          ? JSON.stringify(arg, null, 2)
          : String(arg),
      )
      .join(" ");
  }
}

export const testLogger = new TestLogger();

// Auto-setup for test environment
if (isTestEnvironment()) {
  testLogger.suppressVerboseLogs();
}

// Helper functions for manual setup if needed
export function setupTestLogging() {
  testLogger.suppressVerboseLogs();
}

export function teardownTestLogging() {
  testLogger.restore();
}
