import {
  BadgeIndianRupee,
  Banknote,
  Boxes,
  ChartNoAxesCombined,
  CircleAlert,
  Clock3,
  Megaphone,
  PackageCheck,
  PackageOpen,
  RotateCcw,
  Truck,
  Users,
} from "lucide-react";

export const roles = ["Owner", "Admin", "Manager", "Support", "Warehouse", "Marketing", "Accountant"];

export const modules = [
  { name: "Dashboard", status: "Live", phase: "Phase 2" },
  { name: "Channels", status: "Build", phase: "Phase 3" },
  { name: "Products", status: "Ready", phase: "Phase 4" },
  { name: "Inventory", status: "Ready", phase: "Phase 5" },
  { name: "Raw Materials", status: "Mapped", phase: "Phase 6" },
  { name: "Orders", status: "Live", phase: "Phase 9" },
  { name: "Shipping", status: "Queued", phase: "Phase 10" },
  { name: "CRM", status: "Design", phase: "Phase 12" },
  { name: "Finance", status: "Ready", phase: "Phase 14" },
  { name: "Ads", status: "Design", phase: "Phase 16" },
  { name: "Automation", status: "Queued", phase: "Phase 18" },
  { name: "Reports", status: "Queued", phase: "Phase 20" },
];

export const kpis = [
  { label: "Today's Sales", value: "₹4.82L", change: "+18.4%", tone: "green", icon: BadgeIndianRupee },
  { label: "Yesterday Sales", value: "₹3.91L", change: "+7.2%", tone: "blue", icon: Banknote },
  { label: "Monthly Sales", value: "₹86.4L", change: "+22.9%", tone: "green", icon: ChartNoAxesCombined },
  { label: "Profit", value: "₹18.7L", change: "21.6% margin", tone: "teal", icon: ChartNoAxesCombined },
  { label: "Expenses", value: "₹11.2L", change: "-3.1%", tone: "amber", icon: Megaphone },
  { label: "Pending Orders", value: "184", change: "42 urgent", tone: "rose", icon: Clock3 },
  { label: "Processing", value: "312", change: "SLA 91%", tone: "blue", icon: PackageOpen },
  { label: "Shipped", value: "1,842", change: "+14.1%", tone: "green", icon: Truck },
  { label: "Delivered", value: "1,596", change: "86.6%", tone: "green", icon: PackageCheck },
  { label: "Cancelled", value: "72", change: "3.4%", tone: "rose", icon: RotateCcw },
  { label: "COD Pending", value: "₹9.8L", change: "624 orders", tone: "amber", icon: CircleAlert },
  { label: "Repeat Customers", value: "38.2%", change: "+4.8%", tone: "teal", icon: Users },
];

export const salesTrend = [
  { day: "Mon", sales: 310000, profit: 72000, orders: 420 },
  { day: "Tue", sales: 380000, profit: 88000, orders: 510 },
  { day: "Wed", sales: 352000, profit: 81000, orders: 488 },
  { day: "Thu", sales: 446000, profit: 109000, orders: 602 },
  { day: "Fri", sales: 482000, profit: 118000, orders: 647 },
  { day: "Sat", sales: 525000, profit: 130000, orders: 701 },
  { day: "Sun", sales: 418000, profit: 96000, orders: 533 },
];

export const channelMix = [
  { name: "Shopify", value: 38 },
  { name: "Amazon", value: 24 },
  { name: "WooCommerce", value: 17 },
  { name: "Flipkart", value: 14 },
  { name: "Manual", value: 7 },
];

export const channels = [
  { name: "Shopify", state: "Connected", orders: 842, sync: "2 min ago", health: 98 },
  { name: "WooCommerce", state: "Connected", orders: 318, sync: "6 min ago", health: 92 },
  { name: "Amazon", state: "Connected", orders: 547, sync: "11 min ago", health: 89 },
  { name: "Flipkart", state: "Reconnect", orders: 214, sync: "1 hr ago", health: 71 },
];

export const channelCatalog = [
  {
    provider: "shopify",
    name: "Shopify",
    description: "Products, orders, inventory, customers, and webhooks.",
    phase: "Store Platform",
    status: "Available",
    accent: "green",
  },
  {
    provider: "woocommerce",
    name: "WooCommerce",
    description: "WordPress store orders, products, and customer sync.",
    phase: "Store Platform",
    status: "Next",
    accent: "blue",
  },
  {
    provider: "amazon",
    name: "Amazon",
    description: "Marketplace orders, catalog, payments, and ads mapping.",
    phase: "Marketplace",
    status: "Available",
    accent: "amber",
  },
  {
    provider: "flipkart",
    name: "Flipkart",
    description: "Marketplace orders, returns, listings, and inventory sync.",
    phase: "Marketplace",
    status: "Next",
    accent: "blue",
  },
  {
    provider: "meesho",
    name: "Meesho",
    description: "Later phase marketplace connection.",
    phase: "Marketplace",
    status: "Planned",
    accent: "slate",
  },
  {
    provider: "glowroad",
    name: "GlowRoad",
    description: "Later phase social commerce connection.",
    phase: "Marketplace",
    status: "Planned",
    accent: "slate",
  },
  {
    provider: "jiomart",
    name: "JioMart",
    description: "Later phase marketplace connection.",
    phase: "Marketplace",
    status: "Planned",
    accent: "slate",
  },
  {
    provider: "myntra",
    name: "Myntra",
    description: "Later phase fashion marketplace connection.",
    phase: "Marketplace",
    status: "Planned",
    accent: "slate",
  },
  {
    provider: "ajio",
    name: "Ajio",
    description: "Later phase fashion marketplace connection.",
    phase: "Marketplace",
    status: "Planned",
    accent: "slate",
  },
  {
    provider: "etsy",
    name: "Etsy",
    description: "Later phase global marketplace connection.",
    phase: "Marketplace",
    status: "Planned",
    accent: "slate",
  },
];

export const orders = [
  { id: "SO-10291", customer: "Aarav Mehta", channel: "Shopify", status: "Pack", payment: "Prepaid", profit: "₹842", courier: "Shiprocket" },
  { id: "SO-10290", customer: "Neha Sharma", channel: "Amazon", status: "Confirm", payment: "COD", profit: "₹311", courier: "Delhivery" },
  { id: "SO-10289", customer: "Ishaan Rao", channel: "WooCommerce", status: "Ship", payment: "Prepaid", profit: "₹1,128", courier: "Blue Dart" },
  { id: "SO-10288", customer: "Diya Kapoor", channel: "WhatsApp", status: "Return", payment: "COD", profit: "-₹146", courier: "Xpressbees" },
  { id: "SO-10287", customer: "Kabir Sethi", channel: "Flipkart", status: "Invoice", payment: "Prepaid", profit: "₹529", courier: "Ekart" },
];

export const inventory = [
  { sku: "TUR-200-JAR", product: "Turmeric Jar 200g", available: 1240, reserved: 184, raw: "4.8 days", alert: "Healthy" },
  { sku: "SALT-500-PCH", product: "Himalayan Salt 500g", available: 386, reserved: 96, raw: "1.7 days", alert: "Low" },
  { sku: "BOX-SM-01", product: "Small Courier Box", available: 620, reserved: 312, raw: "2.1 days", alert: "Watch" },
  { sku: "LBL-TUR-JAR", product: "Turmeric Jar Label", available: 294, reserved: 184, raw: "1.3 days", alert: "Low" },
];

export const automations = [
  { trigger: "Order received", action: "Send WhatsApp confirmation", runs: "1,982", status: "Active" },
  { trigger: "Low stock", action: "Notify warehouse and create PO draft", runs: "38", status: "Active" },
  { trigger: "Abandoned checkout", action: "Wait 30 min, then coupon reminder", runs: "614", status: "Draft" },
];

export const financeBreakdown = [
  { label: "Product Cost", value: 32 },
  { label: "Shipping", value: 14 },
  { label: "Ads", value: 18 },
  { label: "GST", value: 9 },
  { label: "Gateway", value: 3 },
  { label: "Net Profit", value: 24 },
];
