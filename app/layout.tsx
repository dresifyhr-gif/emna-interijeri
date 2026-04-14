import type { Metadata } from "next";
import { Raleway, DM_Sans } from "next/font/google";
import "./globals.css";

const raleway = Raleway({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-raleway",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EMNA Interijeri – Kompletno opremanje interijera po mjeri",
  description:
    "Vlastita proizvodnja, dizajn i montaža kompletnih interijera. Kuhinje, ormari, spavaće sobe i poslovni prostori – sve na jednom mjestu. Zatražite ponudu.",
  keywords:
    "kompletno opremanje interijera, kuhinje po mjeri, ormari po mjeri, interijeri Zagreb, namještaj po mjeri, EMNA interijeri",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "EMNA Interijeri – Kompletno opremanje interijera po mjeri",
    description: "Vlastita proizvodnja, dizajn i montaža. Kuhinje, ormari, spavaće sobe i poslovni prostori.",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630 }],
    locale: "hr_HR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="hr"
      className={`${raleway.variable} ${dmSans.variable}`}
      data-scroll-behavior="smooth"
    >
      <body className="bg-white text-brand-black antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
