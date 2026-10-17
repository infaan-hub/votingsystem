// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { Tile } from "@/src/components/ui/tile";

afterEach(cleanup);

describe("explore tile cover art", () => {
  it("fits a category's election image inside the unchanged tile box", () => {
    const { container } = render(
      <Tile
        tile={{
          id: 7,
          label: "Student Council",
          meta: "3",
          href: "/categories/student-council",
          image: "/api/elections/12/image/",
        }}
      />,
    );

    const link = container.querySelector("a");
    // The tile keeps its fixed footprint — the image only fills what is there.
    expect(link?.className).toContain("min-h-[104px]");
    expect(link?.className).toContain("rounded-[18px]");

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    // next/image serves the tile art through its optimizer; the source
    // endpoint survives as the (URL-encoded) `url` parameter.
    const src = img?.getAttribute("src") ?? "";
    expect(src).toContain(encodeURIComponent("/api/elections/12/image/"));
    // Decorative cover art must not leak into the accessibility tree.
    expect(img?.getAttribute("alt")).toBe("");

    // A scrim sits above the image so the white label stays readable.
    const scrim = link?.querySelector("span.absolute.inset-0");
    expect(scrim).not.toBeNull();
    expect(scrim?.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps the plain gradient tile when the category has no imaged election", () => {
    const { container } = render(
      <Tile tile={{ id: 8, label: "Faculty Board", meta: "0", href: "/categories/faculty-board" }} />,
    );

    expect(container.querySelector("a")?.className).toMatch(/nv-tile-/);
    expect(container.querySelector("img")).toBeNull();
  });
});
