export function parseIndexArgs(args: string[] = []) {
  for (const arg of args) {
    if (typeof arg === 'string' && arg.startsWith('--')) {
      return {
        ok: false,
        error: new Error(`Unsupported /ralph-index option: ${arg}`),
      };
    }
  }

  return { ok: true };
}
