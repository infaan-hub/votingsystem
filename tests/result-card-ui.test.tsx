// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ResultCard, type ResultCardPayload } from "@/src/components/result-card";

afterEach(cleanup);

function makeCard(overrides: Partial<ResultCardPayload> = {}): ResultCardPayload {
  return {
    election: {
      id: 7,
      slug: "chancellor-2026",
      title: "Chancellor 2026",
      status: "ended",
      lifecycle_status: "CLOSED",
      voting_end_at: "2026-10-16T09:00:00.000000Z",
      published: true,
      result_published_at: "2026-10-16T10:00:00.000000Z",
    },
    winner: {
      candidate_id: 1,
      name: "Alice Mensah",
      photo_url: "/media/alice.jpg",
      slogan: "Students first",
      position_name: "Chancellor",
      votes: 120,
      percentage: 60,
    },
    candidates: [
      {
        candidate_id: 1,
        name: "Alice Mensah",
        photo_url: "/media/alice.jpg",
        slogan: "Students first",
        position_name: "Chancellor",
        votes: 120,
        percentage: 60,
      },
      {
        candidate_id: 2,
        name: "Bob Otieno",
        photo_url: "/media/bob.jpg",
        slogan: "",
        position_name: "Chancellor",
        votes: 80,
        percentage: 40,
      },
    ],
    totals: { votes: 200, candidates: 2 },
    ...overrides,
  };
}

describe("published result card", () => {
  it("shows the NexVote logo, election name, green winner, photo, votes and share", () => {
    const { container } = render(<ResultCard card={makeCard()} />);

    // Small NexVote logo on the left, election name below it.
    const logo = container.querySelector("img");
    expect(logo?.getAttribute("src")).toBe("/nexvote_logo.jpeg");
    expect(screen.getByText("Chancellor 2026")).toBeTruthy();

    // Winner in bold green type, then the winner's front image and name.
    const nameNodes = screen.getAllByText("Alice Mensah");
    expect(nameNodes.some((node) => node.className.includes("text-nv-success"))).toBe(true);
    const photos = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(photos).toContain("/media/alice.jpg");

    // Votes and share of the election.
    expect(screen.getByText("120 votes · 60.0% of the vote")).toBeTruthy();
  });

  it("keeps the full result behind the button, then lists every candidate", () => {
    render(<ResultCard card={makeCard()} />);

    expect(screen.queryByText("Bob Otieno")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /show full result/i }));

    expect(screen.getByText(/full result · 2 candidates · 200 votes counted/i)).toBeTruthy();
    expect(screen.getByText("Bob Otieno")).toBeTruthy();
    expect(screen.getByText("80")).toBeTruthy();
    expect(screen.getByText("40.0%")).toBeTruthy();
    expect(screen.getByRole("button", { name: /hide full result/i })).toBeTruthy();
  });

  it("labels an unpublished card as a preview and handles an empty tally", () => {
    const { rerender } = render(
      <ResultCard
        card={makeCard({
          election: {
            ...makeCard().election,
            published: false,
            result_published_at: null,
          },
        })}
      />,
    );
    expect(screen.getByText("Preview")).toBeTruthy();

    rerender(
      <ResultCard
        card={makeCard({
          winner: null,
          candidates: [],
          totals: { votes: 0, candidates: 0 },
        })}
      />,
    );
    expect(screen.getByText(/no votes were cast/i)).toBeTruthy();
    expect(screen.getByText("Published")).toBeTruthy();
  });
});
