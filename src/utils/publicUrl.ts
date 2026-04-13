/**
 * Resolve a URL for a file under Vite `public/` (e.g. `icons/foo.svg`, `aws-icons/Bar.svg`).
 * Always use this instead of hardcoded `/…` so `base` in vite.config and nested deploys work.
 */
export function publicUrl(pathFromPublic: string): string {
  const base = (import.meta.env.BASE_URL as string) || "/";
  const p = pathFromPublic.replace(/^\/+/, "");
  return `${base}${p}`;
}
