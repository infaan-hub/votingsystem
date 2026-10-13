"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";

type GuardRole = "admin" | "officer" | "user";

/**
 * Client-side role gate.
 *
 * The API is the security boundary — every privileged endpoint re-checks the
 * token server-side. This component only prevents a signed-in but
 * under-privileged user from *seeing* a dashboard shell: it redirects to the
 * login page (returning to the same URL afterwards) when nobody is signed in,
 * and renders an explicit "access required" panel when the role does not
 * match.
 */
export function RequireRole({
  role,
  children,
}: {
  role: GuardRole;
  children: React.ReactNode;
}) {
  const { user, token } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  const authorized =
    !!user &&
    (role === "admin"
      ? user.role === "admin"
      : role === "officer"
        ? user.role === "officer" || user.role === "admin"
        : true);

  useEffect(() => {
    // While the session is still resolving, wait rather than bouncing a
    // signed-in user to the login page.
    if (token && !user) return;
    if (!token || !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [token, user, pathname, router]);

  if (!user) {
    return (
      <div className="space-y-4 py-6" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="mx-auto max-w-lg py-14 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-nv-primary-100 text-nv-primary">
          <ShieldAlert className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-fluid-xl text-nv-ink">Access required</h1>
        <p className="mt-2 text-[14px] text-nv-muted">
          This area is limited to{" "}
          <span className="font-semibold text-nv-text">
            {role === "admin" ? "administrators" : "election officers"}
          </span>
          . You are signed in as{" "}
          <span className="font-semibold text-nv-text">{user.username}</span>.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard">Go to my dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
