import { cn } from "@/src/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-nv-line/70", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };