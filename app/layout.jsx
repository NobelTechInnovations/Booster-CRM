import "./globals.css";
import { AppProviders } from "@/components/providers";

export const metadata = {
  title: "CommerceOS | Sukirti Commerce Hub",
  description: "Unified commerce command center for orders, inventory, CRM, finance, ads, and automation.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
