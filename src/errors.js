// Failures that carry a stable code to MCP callers and to the run module's callers alike.
export const CODES = Object.freeze({
  BAD_REQUEST: 'BAD_REQUEST',
  NAME_INVALID: 'NAME_INVALID',
  MODULE_EXISTS: 'MODULE_EXISTS',
  MODULE_UNKNOWN: 'MODULE_UNKNOWN',
  MODULE_LOAD_FAILED: 'MODULE_LOAD_FAILED',
  MODULE_NOT_FUNCTION: 'MODULE_NOT_FUNCTION',
  LIBRARY_UNAVAILABLE: 'LIBRARY_UNAVAILABLE',
  TOOL_UNKNOWN: 'TOOL_UNKNOWN',
  FORMAT_UNKNOWN: 'FORMAT_UNKNOWN',
  INTERNAL: 'INTERNAL',
});

export class CodedError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'CodeLibraryError';
    this.code = code;
  }
}
