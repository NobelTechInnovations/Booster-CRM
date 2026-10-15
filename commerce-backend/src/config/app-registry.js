// The catalogue of installable applications.
//
// Deliberately code, not a database collection. An app's routes, views and
// permissions ship inside this repository — a database row claiming an app
// exists when no code backs it would be a lie the UI would then render a
// menu item for. Keeping the catalogue here means adding an app is one entry
// plus its code, with no seed step and no migration, and the DB only ever
// stores the thing that genuinely varies per workspace: which apps are
// installed (see models/org-app.model.js).
//
// Icons are lucide-react component NAMES, resolved on the frontend via
// lib/nav-icons.js — the API can't send a React component down the wire.
//
// Permission keys deliberately keep the existing `resource:action` spelling
// that the 67 requirePermission() call sites already use, so nothing needed
// rewriting to adopt this. Apps added from here on (People, Tasks) use the
// namespaced `app.resource.action` form instead; both are just strings and
// both resolve the same way.

// Sidebar group order, preserved exactly as the hardcoded NAV_GROUPS had it
// so an existing workspace with everything installed sees an unchanged menu.
export const NAV_GROUP_ORDER = [
  "Dashboard",
  "Orders",
  "Customers",
  "Leads",
  "Support",
  "People",
  "Tasks",
  "Products",
  "Finance",
  "Channels",
  "Marketing",
  "Company Manage",
  "Settings",
];

export const APP_CATEGORIES = {
  core: "Platform",
  commerce: "Commerce",
  operations: "Operations",
  marketing: "Marketing",
};

// The first question a new workspace is asked, and the app bundle each
// answer starts them on. Same idea as Odoo's "what do you want to manage?"
// — a starting point, not a cage: every app stays installable afterwards
// from the Apps page.
//
// Presets may name apps that don't exist yet (People and Tasks are Phase 3
// and 4). Unknown slugs are skipped rather than erroring, so these entries
// start working by themselves the day those apps ship, with no edit here.
export const BUSINESS_TYPES = [
  {
    slug: "ecommerce",
    name: "Online store",
    description: "You sell products online through Shopify, Amazon or your own site.",
    icon: "ShoppingCart",
    apps: ["orders", "customers", "leads", "products", "channels", "finance", "ads", "marketing", "support", "reports", "automation"],
  },
  {
    slug: "institute",
    name: "Institute or coaching centre",
    description: "You run centres and need to manage staff, their work and reporting.",
    icon: "Users",
    apps: ["people", "tasks", "support", "reports"],
  },
  {
    slug: "services",
    name: "Agency or services",
    description: "You deliver work for clients and track it through to invoicing.",
    icon: "Workflow",
    apps: ["people", "tasks", "customers", "leads", "finance", "support", "reports"],
  },
  {
    slug: "retail",
    name: "Retail or offline business",
    description: "You sell in person and want stock, customers and books in one place.",
    icon: "Package",
    apps: ["products", "customers", "finance", "support", "reports"],
  },
  {
    slug: "custom",
    name: "Start from scratch",
    description: "Begin with nothing and add exactly the apps you want.",
    icon: "LayoutGrid",
    apps: [],
  },
];

export function getBusinessType(slug) {
  return BUSINESS_TYPES.find((type) => type.slug === String(slug || "")) || null;
}

export const APPS = [
  {
    slug: "core",
    name: "Core",
    description: "Dashboard, workspace profile, team members and settings. Always installed.",
    category: "core",
    icon: "Gauge",
    // Core cannot be uninstalled — a workspace with no dashboard, no team
    // management and no settings has no way to administer itself back.
    required: true,
    permissions: [
      { key: "dashboard:read", label: "View dashboard" },
      { key: "company:read", label: "View workspace profile" },
      { key: "company:manage", label: "Edit workspace profile" },
      { key: "users:read", label: "View team members" },
      { key: "users:manage", label: "Invite and manage team members" },
      { key: "apps:manage", label: "Install and remove apps" },
      { key: "roles:manage", label: "Create and edit roles" },
      { key: "audit:read", label: "View the audit log" },
    ],
    nav: [
      { label: "Dashboard", icon: "Gauge", href: "/panel", permission: "dashboard:read" },
      { group: "Company Manage", groupIcon: "Building2", label: "Company", icon: "Building2", href: "/panel/company", permission: "company:read" },
      { group: "Company Manage", groupIcon: "Building2", label: "Users", icon: "Users", href: "/panel/users", permission: "users:read" },
      { group: "Company Manage", groupIcon: "Building2", label: "Apps", icon: "LayoutGrid", href: "/panel/apps", permission: "apps:manage" },
      { label: "Settings", icon: "Settings", href: "/panel/settings" },
    ],
  },

  {
    slug: "orders",
    name: "Orders & Fulfilment",
    description: "Order management, confirmation, packing, shipping labels and returns.",
    category: "commerce",
    icon: "ShoppingCart",
    permissions: [
      { key: "orders:read", label: "View orders" },
      { key: "orders:update", label: "Update orders" },
      { key: "orders:manage", label: "Full order management" },
      { key: "orders:pack", label: "Pack and ship orders" },
      { key: "shipping:manage", label: "Manage shipments" },
    ],
    nav: [
      { group: "Orders", groupIcon: "ShoppingCart", label: "Orders", icon: "ShoppingCart", href: "/panel/orders", permission: "orders:read" },
      { group: "Orders", groupIcon: "ShoppingCart", label: "Fulfillment", icon: "PackageCheck", href: "/panel/fulfillment", permission: "orders:read" },
    ],
  },

  {
    slug: "customers",
    name: "Customers",
    description: "Customer records, order history, follow-ups and segments.",
    category: "commerce",
    icon: "UserRound",
    permissions: [{ key: "customers:read", label: "View customers" }, { key: "customers:manage", label: "Manage customers" }],
    nav: [{ label: "Customers", icon: "UserRound", href: "/panel/customers", permission: "customers:read" }],
  },

  {
    slug: "leads",
    name: "Leads",
    description: "Inbound leads captured from webhooks, with follow-up tracking.",
    category: "commerce",
    icon: "Webhook",
    permissions: [{ key: "leads:read", label: "View leads" }, { key: "leads:manage", label: "Manage leads" }],
    nav: [{ label: "Leads", icon: "Webhook", href: "/panel/leads", permission: "leads:read" }],
  },

  {
    slug: "support",
    name: "Support",
    description: "Customer support tickets with a public submission page and attachments.",
    category: "operations",
    icon: "Headset",
    permissions: [{ key: "support:manage", label: "Manage support tickets" }],
    nav: [{ label: "Support", icon: "Headset", href: "/panel/support", permission: "support:manage" }],
  },

  {
    slug: "products",
    name: "Products & Inventory",
    description: "Catalogue, product mapping across channels, stock levels and raw material assets.",
    category: "commerce",
    icon: "Package",
    permissions: [
      { key: "inventory:read", label: "View inventory" },
      { key: "inventory:manage", label: "Manage inventory" },
    ],
    nav: [
      { group: "Products", groupIcon: "Package", label: "Products", icon: "Package", href: "/panel/products", permission: "inventory:read" },
      { group: "Products", groupIcon: "Package", label: "Product Mapping", icon: "Workflow", href: "/panel/product-mapping", permission: "inventory:read" },
      { group: "Products", groupIcon: "Package", label: "Inventory", icon: "Boxes", href: "/panel/inventory", permission: "inventory:read" },
      { group: "Products", groupIcon: "Package", label: "Assets & Stock", icon: "Package2", href: "/panel/assets", permission: "inventory:read" },
    ],
  },

  {
    slug: "finance",
    name: "Finance",
    description: "Revenue, expenses, vendors, purchases, P&L and unit economics.",
    category: "commerce",
    icon: "CircleDollarSign",
    permissions: [{ key: "finance:manage", label: "Manage finance" }],
    nav: [
      { group: "Finance", groupIcon: "CircleDollarSign", label: "Overview", icon: "CircleDollarSign", href: "/panel/finance", permission: "finance:manage" },
      { group: "Finance", groupIcon: "CircleDollarSign", label: "Analytics", icon: "BarChart2", href: "/panel/finance?tab=sales", permission: "finance:manage" },
    ],
  },

  {
    slug: "ads",
    name: "Ads Manager",
    description: "Meta ad spend, ROAS attribution, and live campaign/budget/creative editing.",
    category: "marketing",
    icon: "Megaphone",
    permissions: [{ key: "ads:manage", label: "Manage ads" }],
    nav: [
      { group: "Finance", groupIcon: "CircleDollarSign", label: "Ads & ROAS", icon: "Activity", href: "/panel/ads", permission: "ads:manage" },
      { group: "Finance", groupIcon: "CircleDollarSign", label: "Ads Manager", icon: "Megaphone", href: "/panel/ads-manager", permission: "ads:manage" },
    ],
  },

  {
    slug: "channels",
    name: "Sales Channels",
    description: "Shopify and Amazon connections, plus shipping courier integrations.",
    category: "commerce",
    icon: "PlugZap",
    permissions: [
      { key: "channels:read", label: "View channels" },
      { key: "channels:manage", label: "Connect and manage channels" },
    ],
    nav: [
      { group: "Channels", groupIcon: "PlugZap", label: "Sales Channels", icon: "PlugZap", href: "/panel/channels", permission: "channels:read" },
      { group: "Channels", groupIcon: "PlugZap", label: "Shipping Partners", icon: "Truck", href: "/panel/shipping", permission: "channels:read" },
    ],
  },

  {
    slug: "marketing",
    name: "Social & WhatsApp",
    description: "Social posting and comments, WhatsApp Business messaging and AI replies.",
    category: "marketing",
    icon: "Camera",
    // Paid. Deliberately reuses the plan feature keys that already exist and
    // are already enforced by requireFeature() — rather than inventing a
    // second, parallel notion of "paid app" that would then have to be kept
    // in sync with the plans an admin actually sells.
    requiresFeature: "social",
    permissions: [
      { key: "social:manage", label: "Manage social" },
      { key: "whatsapp:manage", label: "Manage WhatsApp" },
    ],
    nav: [
      { group: "Marketing", groupIcon: "Camera", label: "Social", icon: "Camera", href: "/panel/social", permission: "social:manage" },
      { group: "Marketing", groupIcon: "Camera", label: "WhatsApp", icon: "MessageCircle", href: "/panel/whatsapp", permission: "whatsapp:manage" },
      { group: "Marketing", groupIcon: "Camera", label: "Smart WhatsApp", icon: "MessageCircle", href: "/panel/smart-whatsapp", permission: "whatsapp:manage" },
    ],
  },

  {
    slug: "automation",
    name: "Automation",
    description: "Trigger-based email and WhatsApp rules with editable templates.",
    category: "operations",
    icon: "Workflow",
    requiresFeature: "automation",
    permissions: [{ key: "automation:manage", label: "Manage automation rules" }],
    nav: [
      { group: "Company Manage", groupIcon: "Building2", label: "Automation", icon: "Workflow", href: "/panel/automation", permission: "automation:manage" },
    ],
  },

  {
    slug: "reports",
    name: "Reports",
    description: "Sales, GST, P&L, expense and customer reports with CSV export.",
    category: "operations",
    icon: "ClipboardList",
    permissions: [{ key: "reports:read", label: "View reports" }],
    nav: [
      { group: "Company Manage", groupIcon: "Building2", label: "Reports", icon: "ClipboardList", href: "/panel/reports", permission: "reports:read" },
    ],
  },
];

// Every app that isn't `core`, i.e. everything a workspace can choose. Used
// by the install migration to give existing workspaces exactly what they
// already had.
export const COMMERCE_APP_SLUGS = APPS.filter((app) => !app.required).map((app) => app.slug);

const BY_SLUG = new Map(APPS.map((app) => [app.slug, app]));

export function getApp(slug) {
  return BY_SLUG.get(String(slug || "")) || null;
}

export function listApps() {
  return APPS;
}

// Every permission key any app declares, with the app it belongs to —
// what the role editor renders as its checklist.
export function allPermissions() {
  return APPS.flatMap((app) =>
    (app.permissions || []).map((permission) => ({ ...permission, app: app.slug, appName: app.name })),
  );
}
