/**
 * Return a JSON text result for MCP tool responses.
 */
export function jsonResult(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(data, bigIntReplacer, 2) },
    ],
  };
}

/**
 * Return an error result for MCP tool responses.
 */
export function errorResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

/**
 * JSON replacer that converts BigInts to strings.
 */
function bigIntReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}
