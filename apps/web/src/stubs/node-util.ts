export function promisify<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}
export function inspect(value: unknown): string {
  return String(value);
}
export default { promisify, inspect };
