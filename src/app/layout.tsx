import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { I18nProvider } from "@/components/i18n-provider";
import { getLocale, getT } from "@/server/i18n";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: { default: "Bettarrow", template: "%s · Bettarrow" },
    description: t.meta.description,
    applicationName: "Bettarrow",
    appleWebApp: { capable: true, title: "Bettarrow", statusBarStyle: "black-translucent" },
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#101210",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh">
        <I18nProvider locale={locale}>{children}</I18nProvider>
        <Toaster
          theme="dark"
          position="top-center"
          offset={{ top: "calc(env(safe-area-inset-top) + 16px)" }}
          mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
          toastOptions={{
            classNames: {
              toast: "!bg-surface-2 !border-border !text-text !rounded-md",
              description: "!text-muted",
              actionButton: "!bg-accent !text-accent-ink !font-semibold",
            },
          }}
        />
      </body>
    </html>
  );
}
