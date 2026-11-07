import type { Metadata, Viewport } from "next";
import { Antonio, Figtree, Noto_Sans_Arabic } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { dir, locale, t } from "@/lib/i18n";
import "./globals.css";

const antonio = Antonio({
  variable: "--font-antonio",
  subsets: ["latin"],
  weight: ["700"],
  display: "swap",
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

// Arabic product names (from the Glovo menu): Antonio and Figtree have no Arabic
// glyphs, so this face takes over for Arabic letters only. Loaded with the page,
// it is also what the PDF capture of a ticket shows.
const notoArabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: t.shopName, template: `%s | ${t.shopName}` },
  description: `Caisse, cuisine et administration de ${t.shopName}, ${t.shopCity}.`,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#2b1b13",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={locale} dir={dir} className={`${antonio.variable} ${figtree.variable} ${notoArabic.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
