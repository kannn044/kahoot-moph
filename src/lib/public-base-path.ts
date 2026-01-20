function normalizeBasePath(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (withLeadingSlash === "/") return "";

  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

export const PUBLIC_BASE_PATH = normalizeBasePath(
  process.env.NEXT_PUBLIC_BASE_PATH
);

export function withBasePath(pathname: string): string {
  if (!PUBLIC_BASE_PATH) return pathname;
  if (!pathname.startsWith("/")) return `${PUBLIC_BASE_PATH}/${pathname}`;
  return `${PUBLIC_BASE_PATH}${pathname}`;
}
