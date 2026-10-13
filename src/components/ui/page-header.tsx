import * as React from "react";
import Link from "next/link";
import { cn } from "@/src/lib/utils";
import { buttonVariants } from "@/src/components/ui/button";

type ButtonVariant =
  | "primary"
  | "navy"
  | "dark"
  | "ghost"
  | "subtle"
  | "destructive"
  | "success"
  | "outline"
  | "hero"
  | "heroGhost";

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
