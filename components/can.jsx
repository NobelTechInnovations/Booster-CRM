"use client";

import { useCommerceStore } from "@/lib/store";
import { can, canAny, effectivePermissions } from "@/lib/permissions";

// Renders its children only when the signed-in person holds the permission.
//
//   <Can permission="finance:manage">
//     <Button>Add expense</Button>
//   </Can>
//
// Pass `fallback` to show something instead (a disabled state, an
// explanation); by default a disallowed block renders nothing at all.
export function Can({ permission, anyOf, fallback = null, children }) {
  const { navPermissions, session } = useCommerceStore();
  const permissions = effectivePermissions({ livePermissions: navPermissions, session });

  const allowed = anyOf?.length ? canAny(permissions, anyOf) : can(permissions, permission);
  return allowed ? children : fallback;
}

// The same check as a hook, for the cases where the decision isn't "render
// this subtree" — disabling a control, picking a default tab, choosing which
// column set a table shows.
export function usePermissions() {
  const { navPermissions, session } = useCommerceStore();
  const permissions = effectivePermissions({ livePermissions: navPermissions, session });

  return {
    permissions,
    can: (permission) => can(permissions, permission),
    canAny: (wanted) => canAny(permissions, wanted),
  };
}
