import { SupportTicketView } from "@/components/support-ticket-view";

// Public, no-auth support tickets — same shape as app/track/[companySlug],
// deliberately outside /panel (which has its own session gate in
// app/panel/layout.jsx). See support-ticket.repo.js on the backend for the
// phone/email lookup + scoping rules.
export default async function SupportTicketPage({ params }) {
  const { companySlug } = await params;
  return <SupportTicketView companySlug={companySlug} />;
}
