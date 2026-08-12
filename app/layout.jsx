import "./globals.css";
import { AppProviders } from "@/components/providers";

export const metadata = {
  title: "Wokbook | Commerce Operations Platform",
  description: "One operational platform for orders, inventory, CRM, finance, ads, and fulfillment.",
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
