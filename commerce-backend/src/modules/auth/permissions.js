export const rolePermissions = {
  Owner: ["*"],
  Admin: ["dashboard:read", "company:read", "company:manage", "users:read", "users:manage", "channels:manage", "orders:manage", "inventory:manage", "reports:read", "finance:manage", "ads:manage", "social:manage", "whatsapp:manage"],
  Manager: ["dashboard:read", "users:read", "company:read", "orders:manage", "inventory:read", "channels:read", "reports:read"],
  Support: ["dashboard:read", "orders:read", "orders:update", "customers:read"],
  Warehouse: ["dashboard:read", "orders:pack", "inventory:manage", "shipping:manage"],
  Marketing: ["dashboard:read", "channels:read", "ads:manage", "social:manage", "whatsapp:manage", "crm:manage", "reports:read"],
  Accountant: ["dashboard:read", "finance:manage", "reports:read", "orders:read"],
};

export const roles = Object.keys(rolePermissions);

export function permissionsForRole(role) {
  return rolePermissions[role] || [];
}
