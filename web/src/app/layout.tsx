import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin", "latin-ext"], variable: "--font-archivo", axes: ["wdth"] });

export const metadata: Metadata = {
  title: "AYAN: Bakı hub planlayıcısı",
  description: "Multimodal mobility hub-ların planlaşdırılması üçün Bakının rəqəmsal əkizi",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="az">
      <body className={`${archivo.variable} antialiased`}>{children}</body>
    </html>
  );
}
