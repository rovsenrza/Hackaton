import type { Metadata } from "next";
import { Manrope, Montserrat } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin", "latin-ext"], variable: "--font-manrope" });
// yalnız AYAN sözişarəsi üçün (loqodakı həndəsi qrotesk)
const montserrat = Montserrat({ subsets: ["latin", "latin-ext"], weight: ["700"], variable: "--font-montserrat" });

export const metadata: Metadata = {
  title: "AYAN: Bakı hub planlayıcısı",
  description: "Multimodal mobility hub-ların planlaşdırılması üçün Bakının rəqəmsal əkizi",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="az">
      <body className={`${manrope.variable} ${montserrat.variable} antialiased`}>{children}</body>
    </html>
  );
}
