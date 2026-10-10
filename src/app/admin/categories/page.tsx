"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { useToast } from "@/src/components/ui/toast";
import { ResponsiveDialog } from "@/src/components/ui/responsive-dialog";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { cn } from "@/src/lib/utils";

type Category = {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  is_active: boolean;
  is_system: boolean;
  election_count: number;
};

const DENSITY_KEY = "election-hub-table-density";

export default function AdminCategoriesPage() {
  const router = useRouter();
  const { token } = useApp();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(DENSITY_KEY);
    if (stored === "compact" || stored === "comfortable") setDensity(stored);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    const response = await fetch("/api/admin/categories/", {
      headers: { Authorization: `Token ${token}` },
    });
    if (response.ok) setCategories(await response.json());
  }, [token]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    void load();
  }, [token, router, load]);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/admin/categories/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${token}`,
        },
        body: JSON.stringify({ name, description, icon }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(
          (data.name as string[] | undefined)?.[0] ?? "Failed to create the category.",
        );
        return;
      }
      setName("");
      setDescription("");
      setIcon("");
      toast({ title: "Category created", tone: "success" });
      await load();
    } catch {
      setError("Failed to create the category.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const category = pendingDelete;
    if (!category) return;
    setPendingDelete(null);
    try {
      const response = await fetch(`/api/admin/categories/${category.id}/`, {
        method: "DELETE",
        headers: { Authorization: `Token ${token}` },
      });
      if (response.ok) {
        toast({ title: `"${category.name}" deleted`, tone: "success" });
        await load();
      } else {
        const data = await response.json().catch(() => ({}));
        const detail = (data.detail as string[] | undefined)?.[0];
        toast({
          title: "Cannot delete category",
          description:
            detail ?? "Elections still use this category. Reassign them first.",
          tone: "error",
        });
      }
    } catch {
      toast({ title: "Failed to delete category", tone: "error" });
    }
  }

  const cell = density === "compact" ? "py-1.5" : "py-3";

  return (
    <div className="mx-auto max-w-4xl px-4 pb-nav lg:pb-0">
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Administration
        </p>
        <h1 className="mt-1 text-display text-fluid-3xl">Categories</h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          Categories define the rules an election follows. Nine ship with the
          platform; you can add your own and reuse them across elections.
        </p>
      </header>

      {/* ---------------- Create ---------------- */}
      <Card className="mb-8">
        <CardContent className="p-5">
          <h2 className="text-fluid-lg font-semibold">Create a category</h2>
          <form onSubmit={onCreate} className="mt-4 grid gap-4 sm:grid-cols-2">
            {error ? (
              <p
                role="alert"
                className="sm:col-span-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            <div className="sm:col-span-2">
              <label htmlFor="cat-name" className="mb-1.5 block text-sm font-medium">
                Name
              </label>
              <input
                id="cat-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="h-11 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="cat-desc" className="mb-1.5 block text-sm font-medium">
                Description
              </label>
              <input
                id="cat-desc"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="h-11 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="cat-icon" className="mb-1.5 block text-sm font-medium">
                Icon (emoji)
              </label>
              <input
                id="cat-icon"
                value={icon}
                onChange={(event) => setIcon(event.target.value)}
                placeholder="📋"
                className="h-11 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {saving ? "Creating…" : "Create category"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ---------------- List ---------------- */}
      {categories === null ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No categories yet.
          </CardContent>
        </Card>
      ) : (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Election categories</caption>
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th scope="col" className="py-2 font-medium">Category</th>
              <th scope="col" className="py-2 font-medium">Elections</th>
              <th scope="col" className="py-2 font-medium">Status</th>
              <th scope="col" className="py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {categories.map((category) => (
              <tr key={category.id} className={cn("align-middle", cell)}>
                <td>
                  <span className="mr-2 text-lg" aria-hidden="true">
                    {category.icon || "📋"}
                  </span>
                  <span className="font-medium">{category.name}</span>
                  {category.is_system ? (
                    <span className="ml-2 text-xs text-muted-foreground">(system)</span>
                  ) : null}
                  <span className="nums-tabular block text-xs text-muted-foreground">
                    /{category.slug}
                  </span>
                </td>
                <td className="nums-tabular">{category.election_count}</td>
                <td>
                  <Badge variant={category.is_active ? "success" : "muted"}>
                    {category.is_active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="text-right">
                  {category.is_system ? (
                    <span className="text-xs text-muted-foreground">Protected</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="dense"
                      onClick={() => setPendingDelete(category)}
                      aria-label={`Delete ${category.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Destructive confirmation: bottom sheet on phones, centred on desktop. */}
      <ResponsiveDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete "${pendingDelete?.name ?? ""}"?`}
        description="This cannot be undone. Categories still used by elections cannot be deleted."
        footer={
          <>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete category
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          {pendingDelete?.election_count
            ? `${pendingDelete.election_count} election(s) currently use this category, so deletion will be refused.`
            : "This category is not used by any election and can be removed."}
        </p>
      </ResponsiveDialog>
    </div>
  );
}