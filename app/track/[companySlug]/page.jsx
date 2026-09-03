import { OrderTrackingView } from "@/components/order-tracking-view";

// Public, no-auth order tracking — deliberately outside /panel (which has
// its own session gate in app/panel/layout.jsx) so this needs no login at
// all. Scoped by the company's own slug since the platform is multi-tenant:
// see public-tracking.repo.js on the backend for why a bare phone number
// alone can't be the only key.
export default async function TrackOrderPage({ params }) {
  const { companySlug } = await params;
  return <OrderTrackingView companySlug={companySlug} />;
}
