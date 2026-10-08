/** Shows `/home/x/Projects` as `~/Projects` (the daemon sends absolute paths). */
export function tildify(p: string): string {
  const m = /^\/(?:home|Users)\/[^/]+(\/.*)?$/.exec(p);
  return m ? `~${m[1] ?? ''}` : p;
}
