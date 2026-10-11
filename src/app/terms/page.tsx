import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/src/components/ui/card";
import tenant from "@/config/tenant";

export const metadata = {
  title: "Terms of use",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 pb-nav lg:pb-10">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold text-nv-muted"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </Link>

      <header className="flex items-center gap-3">
        <span className="nv-grad-profile grid h-11 w-11 place-items-center rounded-xl text-white">
          <FileText className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-[24px] font-extrabold leading-7 tracking-tight text-nv-ink">
            Terms of use
          </h1>
          <p className="text-[12px] text-nv-muted">{tenant.authority.name}</p>
        </div>
      </header>

      <Card>
        <CardContent className="space-y-4 p-5">
          <p className="text-[14px] leading-6 text-nv-text">
            Access to vote is granted only to people who are eligible under the
            rules configured for each election. Using another person&rsquo;s
            credentials, or voting more than once, is a breach of these terms.
          </p>
          <p className="text-[14px] leading-6 text-nv-text">
            Results are published according to the visibility policy set for each
            election. Where live results are enabled, counts may change while
            voting is open and are not final until the election is closed and
            audited.
          </p>
          <p className="text-[14px] leading-6 text-nv-text">
            Candidate ratings and public opinions are user contributions.{" "}
            {tenant.name} does not endorse them, and moderation rules are set by
            the election authority.
          </p>
          <p className="text-[14px] leading-6 text-nv-muted">
            Contact:{" "}
            <a
              href={`mailto:${tenant.authority.contactEmail}`}
              className="font-semibold text-nv-primary hover:underline"
            >
              {tenant.authority.contactEmail}
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}