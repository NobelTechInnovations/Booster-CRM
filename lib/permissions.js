// Client-side permission checks.
//
// Until now the frontend did none of this: every menu item and every button
// rendered for everyone, and the only thing standing between a Warehouse
// user and the finance screens was the backend refusing the API call once
// they got there. That's a safe boundary but a terrible experience — you
// find out what you can't do by being told no.
//
// This is UX only. The real boundary is still requirePermission() on the
// server; hiding a button here never makes an endpoint safe.

export function can(permissions, permission) {
  if (!permission) return true;
  const list = Array.isArray(permissions) ? permissions : [];
  return list.includes("*") || list.includes(permission);
}

// True if the holder has at least one of the given permissions — for a screen
// reachable several ways, like Settings.
export function canAny(permissions, wanted = []) {
  if (!wanted.length) return true;
  return wanted.some((permission) => can(permissions, permission));
}

// The permission list to check against, preferring the live one the nav
// endpoint returned and falling back to whatever the session was issued
// with at login. The fallback matters on first paint, before the nav
// request has come back.
export function effectivePermissions({ livePermissions, session }) {
  if (livePermissions?.length) return livePermissions;
  return session?.user?.permissions || [];
}
