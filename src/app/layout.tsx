import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SidebarNav } from "@/components/layout/nav";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { getIntegrationStatuses } from "@/lib/config/integrations";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Prospect Intelligence", template: "%s · Prospect Intelligence" },
  description: "Inteligencia comercial: descubre, analiza y prioriza negocios reales.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  const pending = getIntegrationStatuses().filter((s) => s.critical && !s.configured).length;
  return (
    // `data-theme` lo fija el script del <head> antes de hidratar, de ahí suppressHydrationWarning.
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <SidebarNav pendingIntegrations={pending} />
        <main className="lg:pl-56">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </body>
    </html>
  );
}
