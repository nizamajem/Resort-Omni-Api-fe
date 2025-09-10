"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    try {
      const r = typeof window !== 'undefined' ? (localStorage.getItem('role') || (document.cookie.match(/(?:^|; )role=([^;]+)/)?.[1] ? decodeURIComponent(document.cookie.match(/(?:^|; )role=([^;]+)/)![1]) : null)) : null;
      setRole(r);
    } catch {}
  }, []);

  const onLogout = () => {
    try {
      localStorage.removeItem("auth");
      localStorage.removeItem("role");
      localStorage.removeItem("token");
      document.cookie = `role=; Path=/; Max-Age=0`;
      document.cookie = `resortName=; Path=/; Max-Age=0`;
    } catch {}
    router.replace('/login');
  };

  const links = [
    { href: "/dashboard", label: "Dashboard", show: true },
    { href: "/history", label: "History", show: true },
    { href: "/admin/packages/add", label: "Add Package", show: role === 'superadmin' },
    { href: "/admin/resorts/add", label: "Add Resort", show: role === 'superadmin' },
  ].filter((l) => l.show);

  // Deprecated top bar — replaced by Sidebar after login.
  return null;
}
