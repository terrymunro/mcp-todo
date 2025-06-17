/**
 * MCP Response Utilities
 * 
 * Standardized response creators for MCP tool handlers
 */

export interface McpResponse {
  [x: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
  _meta?: Record<string, unknown>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Creates a standardized error response for MCP tools
 * 
 * @param message - The error message to return
 * @returns Formatted MCP error response
 */
export function createErrorResponse(message: string): McpResponse {
  return {
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
  };
}

/**
 * Creates a standardized success response for MCP tools
 * 
 * @param data - The data to return (string or object)
 * @returns Formatted MCP success response
 */
export function createSuccessResponse(data: string | object): McpResponse {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

/**
 * Creates a formatted batch operation summary response
 * 
 * @param operation - The operation type (e.g., "write", "delete", "move")
 * @param results - Array of operation results
 * @param extraData - Additional data to include in summary
 * @returns Formatted batch operation response
 */
export function createBatchSummaryResponse(
  operation: string,
  results: Array<{ success: boolean; [key: string]: unknown }>,
  extraData?: Record<string, unknown>,
): McpResponse {
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  const summary = {
    total: results.length,
    successful,
    failed,
    ...extraData,
    results,
  };

  const message = `Batch ${operation} completed: ${successful} successful, ${failed} failed. Details: ${JSON.stringify(summary, null, 2)}`;
  return createSuccessResponse(message);
}

/**
 * Resource-specific response interfaces and utilities
 */

export interface ResourceListItem {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * Creates a standardized resource content response that matches MCP SDK expectations
 * 
 * @param uri - The resource URI
 * @param data - The data to return (string or object)
 * @param mimeType - The MIME type (defaults to application/json for objects)
 * @returns Formatted resource response compatible with MCP SDK
 */
export function createResourceResponse(
  uri: string,
  data: string | object,
  mimeType?: string,
) {
  const isObject = typeof data === "object";
  const text = isObject ? JSON.stringify(data, null, 2) : data as string;
  const contentType = mimeType || (isObject ? "application/json" : "text/plain");
  
  return {
    contents: [{
      uri,
      mimeType: contentType,
      text,
    }],
  };
}

/**
 * Creates a resource list response with multiple items
 * 
 * @param resources - Array of resource list items
 * @returns Formatted resource list response
 */
export function createResourceListResponse(resources: ResourceListItem[]) {
  return { resources };
}