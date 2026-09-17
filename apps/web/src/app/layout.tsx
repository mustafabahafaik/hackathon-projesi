import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { AppStoreProvider } from "@/lib/store";

// Nocturne pairs Inter with Inter; headings never go past weight 500.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Depozito · Kira depozitosu emanette",
  description:
    "Kiracı depozitosu emanet sözleşmesinde tutulur, kira boyunca getiri üretir; çıkışta itiraz edilmeyen tutar beklemeden ödenir.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${inter.variable} antialiased`}>
      <body>
        <AppStoreProvider>
          <div className="grid min-h-screen grid-rows-[auto_minmax(0,1fr)] bg-bg">
            <SiteHeader />
            {children}
          </div>
        </AppStoreProvider>
      </body>
    </html>
  );
}
