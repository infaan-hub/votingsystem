import * as React from "react";
import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/src/lib/utils";
import { buttonVariants } from "@/src/components/ui/button";

type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
type ButtonSize = VariantProps<typeof buttonVariants>["size"];

/** Primary/secondary action button rendered as a link with identical styling. */
export function LinkButton({
  href,
  children,
  variant = "primary",
  size,
  className,
  ...rest
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), className)} {...rest}>
      {children}
    </Link>
  );
}
