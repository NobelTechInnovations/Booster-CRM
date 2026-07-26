export const rolePermissions = {
  Owner: ["*"],
  Admin: ["dashboard:read", "users:manage", "channels:manage", "orders:manage", "inventory:manage", "reports:read"],
  Manager: ["dashboard:read", "orders:manage", "inventory:read", "channels:read", "reports:read"],
  Support: ["dashboard:read", "orders:read", "orders:update", "customers:read"],
  Warehouse: ["dashboard:read", "orders:pack", "inventory:manage", "shipping:manage"],
  Marketing: ["dashboard:read", "channels:read", "ads:manage", "crm:manage", "reports:read"],
  Accountant: ["dashboard:read", "finance:manage", "reports:read", "orders:read"],
};

export function permissionsForRole(role) {
  return rolePermissions[role] || [];
}
