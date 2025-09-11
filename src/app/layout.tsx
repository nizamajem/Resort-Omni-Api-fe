import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/app/components/sidebar";
import NavBar from "@/app/components/navbar";
import { AuthProvider } from "@/app/auth.context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Resort Dashboard",
  description: "Management dashboard for resort bookings and payments",
  icons: { icon: "/icon.svg" }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased text-gray-900 bg-gradient-to-b from-sky-50 to-slate-50`}>
        <AuthProvider>
        <NavBar />
        <div className="min-h-screen">
          <div className="mx-auto flex max-w-6xl">
            <Sidebar />
            <main className="min-w-0 flex-1 px-4 py-6">{children}</main>
          </div>
        </div>
              </AuthProvider>
      </body>
    </html>
  );
}