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
                <CardHeader>
                  <CardTitle className="text-fluid-lg">
                    {category.name}
                  </CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}