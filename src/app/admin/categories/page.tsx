"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Badge } from "@/src/components/ui/badge";
import { useApp } from "@/src/components/AppProvider";

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

export default function AdminCategoriesPage() {
  const router = useRouter();
  const { token } = useApp();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    fetchCategories();
  }, [token, router]);

  async function fetchCategories() {
    try {
      const res = await fetch("/api/admin/categories/", {
        headers: { Authorization: `Token ${token}` },
      });
      if (res.ok) setCategories(await res.json());
    } catch {
      setError("Failed to load categories.");
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/categories/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${token}`,
        },
        body: JSON.stringify({ name, description, icon }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.name?.[0] || "Failed to create category.");
        return;
      }
      setName("");
      setDescription("");
      setIcon("");
      await fetchCategories();
    } catch {
      setError("Failed to create category.");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id: number) {
    if (!confirm("Delete this category?")) return;
    try {
      const res = await fetch(`/api/admin/categories/${id}/`, {
        method: "DELETE",
        headers: { Authorization: `Token ${token}` },
      });
      if (res.ok) await fetchCategories();
      else {
        const data = await res.json();
        setError(data.detail?.[0] || "Cannot delete: elections still use this category.");
      }
    } catch {
      setError("Failed to delete category.");
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
      <p className="mt-2 text-muted-foreground">Manage election categories.</p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Create category</CardTitle>
          <CardDescription>Add a new election category.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-desc">Description</Label>
              <Input id="cat-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-icon">Icon (emoji)</Label>
              <Input id="cat-icon" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📋" />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create category"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-8 space-y-3">
        {categories.map((cat) => (
          <Card key={cat.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{cat.icon || "📋"}</span>
                <div>
                  <p className="font-medium">{cat.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {cat.election_count} election{cat.election_count !== 1 ? "s" : ""}
                    {cat.is_system && " · system"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={cat.is_active ? "success" : "muted"}>
                  {cat.is_active ? "Active" : "Inactive"}
                </Badge>
                {!cat.is_system && (
                  <Button variant="destructive" size="sm" onClick={() => onDelete(cat.id)}>
                    Delete
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}