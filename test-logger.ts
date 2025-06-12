// Simple conditional logger for tests
class TestLogger {
  private logBuffer: string[] = [];
  private isCapturing = false;
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

  startCapture() {
    this.logBuffer = [];
    this.isCapturing = true;
    
    console.log = (...args: any[]) => {
      if (this.isCapturing) {
        this.logBuffer.push(`LOG: ${this.formatArgs(args)}`);
      } else {
        this.originalConsole.log(...args);
      }
    };
    
    console.error = (...args: any[]) => {
      if (this.isCapturing) {
        this.logBuffer.push(`ERROR: ${this.formatArgs(args)}`);
      } else {
        this.originalConsole.error(...args);
      }
    };
    
    console.warn = (...args: any[]) => {
      if (this.isCapturing) {
        this.logBuffer.push(`WARN: ${this.formatArgs(args)}`);
      } else {
        this.originalConsole.warn(...args);
      }
    };
  }

  stopCapture() {
    this.isCapturing = false;
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
  }

  flushLogsOnFailure() {
    if (this.logBuffer.length > 0) {
      this.originalConsole.log('\n📋 Debug logs for failed test:');
      this.logBuffer.forEach(log => this.originalConsole.log(`  ${log}`));
      this.originalConsole.log('');
    }
  }

  clear() {
    this.logBuffer = [];
  }

  private formatArgs(args: any[]): string {
    return args.map(arg => 
      typeof arg === 'object' && arg !== null 
        ? JSON.stringify(arg, null, 2) 
        : String(arg)
    ).join(' ');
  }
}

export const testLogger = new TestLogger();

// Helper function to run a test with conditional logging
export async function testWithConditionalLogs<T>(
  testFn: () => T | Promise<T>
): Promise<T> {
  testLogger.startCapture();
  
  try {
    const result = await testFn();
    testLogger.stopCapture();
    testLogger.clear(); // Clear logs on success
    return result;
  } catch (error) {
    testLogger.stopCapture();
    testLogger.flushLogsOnFailure(); // Show logs on failure
    testLogger.clear();
    throw error;
  }
}