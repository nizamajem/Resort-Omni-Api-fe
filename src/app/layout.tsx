import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/app/components/sidebar";
import { cookies } from "next/headers";

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
};

// Mark this layout as dynamic because it reads cookies() at render-time
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = cookies();
  const role = cookieStore.get("role")?.value || "";
  const showSidebar = Boolean(role);
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased text-gray-900 bg-gradient-to-b from-sky-50 to-slate-50`}>
        {showSidebar ? (
          <div className="min-h-screen">
            <div className="mx-auto flex max-w-6xl">
              <Sidebar />
              <main className="min-w-0 flex-1 px-4 py-6">{children}</main>
            </div>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
