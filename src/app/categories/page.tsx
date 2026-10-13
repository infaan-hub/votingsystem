import Link from "next/link";
import { prisma } from "@/src/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { PageHero } from "@/src/components/page-hero";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const categories = await prisma.electionCategory.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: { _count: { select: { elections: true } } },
  });

  return (
    <div className="mx-auto max-w-7xl pb-nav lg:pb-0">
      <PageHero
        eyebrow="Categories"
        title="Election categories"
        description="Categories define the rules an election follows. Nine are provided out of the box; administrators can create their own."
        className="-mt-6"
      />

      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No categories are available.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <Link key={category.id} href={`/categories/${category.slug}`}>
              <Card className="h-full transition-shadow hover:shadow-panel">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-fluid-lg">
                    <span className="text-2xl" aria-hidden="true">
                      {category.icon || "📋"}
                    </span>
                    {category.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="nums-tabular text-sm font-medium">
                    {category._count?.elections ?? 0} election
                    {(category._count?.elections ?? 0) === 1 ? "" : "s"}
                  </p>
                  {category.description ? (
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                      {category.description}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}