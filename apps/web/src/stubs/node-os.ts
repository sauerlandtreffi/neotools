export function homedir(): string {
  return '/';
}
export function tmpdir(): string {
  return '/tmp';
}
export function platform(): string {
  return 'browser';
}
export function type(): string {
  return 'Browser';
}
export const EOL = '\n';
export default { homedir, tmpdir, platform, type, EOL };
