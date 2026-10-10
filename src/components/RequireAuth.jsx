"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export default function RequireAuth({ user, allowAdmin = false, loginPath = "/voter/login", children }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!user) {
      router.replace(`${loginPath}?from=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!allowAdmin && user.role === "admin") {
      router.replace("/admin/dashboard");
    }
  }, [user, allowAdmin, loginPath, pathname, router]);

  if (!user) {
    return null;
  }

  if (!allowAdmin && user.role === "admin") {
    return null;
  }

  return children;
}
