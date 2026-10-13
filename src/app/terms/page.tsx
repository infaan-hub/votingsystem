import { FileText } from "lucide-react";

import { Card, CardContent } from "@/src/components/ui/card";
import { PageHero } from "@/src/components/page-hero";
import tenant from "@/config/tenant";

export const metadata = {
  title: "Terms of use",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-nav lg:pb-10">
      <PageHero
        backHref="/"
        avatar={
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/20 text-white">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
        }
        title="Terms of use"
        meta={tenant.authority.name}
        variant="compact"
        className="-mt-6"
      />

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