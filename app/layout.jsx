import { Inter } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers";

// globals.css has always declared "Inter" as the font-family, but nothing
// ever actually loaded it — with no @font-face and no next/font import, the
// browser silently fell back to the OS's own default UI font (San Francisco
// on Mac, Segoe UI on Windows) for the entire app. That's the real cause of
// the typography not matching any reference design: it was never rendering
// in the intended typeface at all.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Wokbook | Commerce Operations Platform",
  description: "One operational platform for orders, inventory, CRM, finance, ads, and fulfillment.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={inter.variable}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
