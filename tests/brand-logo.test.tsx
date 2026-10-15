// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { PageHero } from "@/src/components/page-hero";
import { AuthBrandHeader } from "@/src/components/auth-shell";
import { BrandLogo } from "@/src/components/brand-logo";

afterEach(cleanup);

describe("real NexVote logo placement", () => {
  it("renders the real logo artwork in the home hero avatar slot", () => {
    const { container } = render(
      <PageHero
        avatar={
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white shadow-float">
            <BrandLogo className="h-full w-full" />
          </span>
        }
        title="NexVote"
        description="Secure voting for every organisation"
        align="center"
      />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/nexvote_logo.jpeg");
  });

  it("renders the full artwork on the auth splash without duplicating the name", () => {
    const { container } = render(<AuthBrandHeader />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/nexvote_logo.jpeg");
    // The wordmark is part of the artwork; the heading stays screen-reader only.
    expect(container.querySelector("h1")?.textContent).toBe("NexVote");
    expect(container.querySelector("h1 .sr-only")).not.toBeNull();
  });

  it("renders the real logo by default everywhere the brand appears", () => {
    const { container } = render(<BrandLogo className="h-8 w-auto rounded-lg" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/nexvote_logo.jpeg");
  });
});
