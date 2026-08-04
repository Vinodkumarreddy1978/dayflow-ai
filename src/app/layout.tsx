import type { Metadata, Viewport } from "next";
import { appOrigin } from "@/lib/env";
import { QueryProvider } from "@/lib/query/provider";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  // Taken from @/lib/env rather than @/lib/public-env on purpose: this is the
  // import that runs the configuration check during a build, and it is the only
  // one. Anything replacing it has to keep that property. See `appOrigin`.
  metadataBase: new URL(appOrigin),
  title: {
    default: "DayFlow AI",
    template: "%s · DayFlow AI",
  },
  description:
    "Record your day as it happens, understand where your time actually goes, and get honest insight rather than raw numbers.",
  applicationName: "DayFlow AI",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "DayFlow AI",
    statusBarStyle: "default",
  },
  // The product records a person's entire life pattern. Nothing about it should
  // ever appear in a search index.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Never restrict zoom. Pinch-to-zoom is a primary accessibility affordance,
  // and disabling it to make an app feel more native trades someone's ability
  // to read the screen for a cosmetic detail. DF-A11Y-045.
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

/**
 * Applies the stored theme before first paint.
 *
 * Runs blocking in the head deliberately: reading the preference in an effect
 * means the page renders light, then flips to dark, and that flash is far more
 * unpleasant than the fraction of a millisecond this costs. DF-DS-002.
 */
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('dayflow-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || ((!stored || stored === 'system') && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <QueryProvider>
          <ToastProvider>{children}</ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
