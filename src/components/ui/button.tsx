import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/src/lib/utils";

/**
 * NexVote button. 48px tall, full width by default, 6–8px radius, uppercase
 * 13px/700 with .5px tracking. Darkens 8% when pressed, drops to 40% opacity
 * when disabled.
 */
const buttonVariants = cva(
  [
    "relative inline-flex select-none items-center justify-center gap-2 overflow-hidden",
    "h-12 w-full whitespace-nowrap rounded-lg",
    "text-[13px] font-bold uppercase tracking-[0.5px]",
    "transition-[transform,background-color,box-shadow,opacity] duration-200 ease-out",
    "active:scale-[0.985]",
    "disabled:pointer-events-none disabled:opacity-40",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary focus-visible:ring-offset-2 focus-visible:ring-offset-nv-bg",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-nv-primary text-white shadow-[0_6px_18px_rgba(4,47,50,0.25)] hover:bg-nv-primary-600 active:bg-nv-primary-600",
        navy: "bg-nv-navy text-white hover:brightness-110 active:brightness-95",
        dark: "bg-nv-navy-600 text-white hover:brightness-125 active:brightness-95",
        ghost:
          "border border-nv-primary bg-transparent text-nv-primary hover:bg-nv-primary-100 active:bg-nv-primary-100",
        subtle:
          "bg-transparent text-nv-muted hover:bg-nv-ink/10 hover:text-nv-ink active:bg-nv-ink/14",
        destructive: "bg-nv-danger text-white hover:brightness-110 active:brightness-95",
        success: "bg-nv-success text-white hover:brightness-105 active:brightness-95",
        /** Legacy alias for the pre-NexVote outline style. */
        outline:
          "border border-nv-line bg-transparent text-nv-ink hover:bg-nv-ink/10 active:bg-nv-ink/14",
      },
      size: {
        default: "h-12 px-5",
        sm: "h-11 px-4 text-[12px]",
        icon: "h-12 w-12 shrink-0",
        dense: "h-9 px-3 text-[12px] normal-case tracking-normal",
        /** Legacy alias; full-width call to action. */
        lg: "h-12 px-7",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    if (asChild) {
      const child = children as React.ReactElement<React.HTMLAttributes<HTMLElement>>;
      return React.cloneElement(child, {
        className: cn(buttonVariants({ variant, size }), child.props.className, className),
      });
    }
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };