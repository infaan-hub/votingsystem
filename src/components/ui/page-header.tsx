import * as React from "react";
import Link from "next/link";
import { cn } from "@/src/lib/utils";
import { buttonVariants } from "@/src/components/ui/button";
import { Breadcrumb, type Crumb } from "@/src/components/ui/breadcrumb";

/**
 * Consistent page heading: optional breadcrumb, title, supporting copy and
 * right-aligned actions. Every screen in the role dashboards uses this so
 * spacing and hierarchy stay identical across routes.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: Crumb[];
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      {breadcrumbs?.length ? <Breadcrumb items={breadcrumbs} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-fluid-xl font-bold tracking-[-0.01em] text-nv-ink">{title}</h1>
          {description ? (
            <p className="max-w-2xl text-[14.5px] leading-relaxed text-nv-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

type ButtonVariant =
  | "primary"
  | "navy"
  | "dark"
  | "ghost"
  | "subtle"
  | "destructive"
  | "success"
  | "outline";

/** Primary/secondary action button rendered as a link with identical styling. */
export function LinkButton({
  href,
  children,
  variant = "primary",
  className,
  ...rest
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant }), className)} {...rest}>
      {children}
    </Link>
  );
}
