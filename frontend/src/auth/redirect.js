const adminRoutes = /^\/admin\/(?:dashboard|repository|documents\/[^/]+)\/?$/;
const studentRoutes = /^\/(?:search|repository|documents\/[^/]+)\/?$/;

export function resolvePostLoginDestination(role, intended) {
  const home = role === "ADMIN" ? "/admin/dashboard" : "/search";
  if (typeof intended !== "string" || !intended.startsWith("/") ||
      intended.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(intended)) {
    return home;
  }

  const pathname = intended.split(/[?#]/, 1)[0];
  try {
    decodeURI(intended);
    // Reject traversal and encoded separators before matching route segments.
    const invalidSegment = pathname.split("/").some((segment) => {
      const decoded = decodeURIComponent(segment);
      return decoded === "." || decoded === ".." || /[/\\\u0000-\u0020\u007f]/.test(decoded);
    });
    if (invalidSegment) return home;
  } catch {
    return home;
  }

  const routes = role === "ADMIN" ? adminRoutes : role === "MAHASISWA" ? studentRoutes : null;
  return routes?.test(pathname) ? intended : home;
}
