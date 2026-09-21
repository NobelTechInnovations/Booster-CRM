import {
  Activity,
  BarChart2,
  Boxes,
  Building2,
  Camera,
  CircleDollarSign,
  ClipboardList,
  Gauge,
  Headset,
  LayoutGrid,
  Megaphone,
  MessageCircle,
  Package,
  Package2,
  PackageCheck,
  PlugZap,
  Settings,
  ShoppingCart,
  Truck,
  UserRound,
  Users,
  Webhook,
  Workflow,
} from "lucide-react";

// The navigation is built on the server now (see the app registry in
// commerce-backend/src/config/app-registry.js), and an API response can only
// carry an icon's NAME — a React component can't be serialized down the wire.
// This maps those names back to real components.
//
// Anything unrecognized falls back to a neutral square rather than rendering
// nothing, so a newly-added app whose icon isn't listed here yet still gets a
// usable, clickable menu item instead of a blank gap.
const ICONS = {
  Activity,
  BarChart2,
  Boxes,
  Building2,
  Camera,
  CircleDollarSign,
  ClipboardList,
  Gauge,
  Headset,
  LayoutGrid,
  Megaphone,
  MessageCircle,
  Package,
  Package2,
  PackageCheck,
  PlugZap,
  Settings,
  ShoppingCart,
  Truck,
  UserRound,
  Users,
  Webhook,
  Workflow,
};

export function navIcon(name) {
  return ICONS[name] || LayoutGrid;
}
