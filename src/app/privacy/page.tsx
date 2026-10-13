import { FileText } from "lucide-react";

import { BackButton } from "@/src/components/back-button";
import { Card, CardContent } from "@/src/components/ui/card";
import tenant from "@/config/tenant";

export const metadata = {
  title: "Privacy policy",
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy policy">
      <p className="text-[14px] leading-6 text-nv-text">
        {tenant.name} processes the minimum personal data required to run a
        lawful election: an identifier, contact details, and the{" "}
        {tenant.geography.constituencyPlural.toLowerCase()} you are registered
        in.
      </p>
      <p className="text-[14px] leading-6 text-nv-text">
        Ballots are recorded separately from voter identities. A voter&rsquo;s
        individual choice is never linked back to their account, and only
        aggregate totals are published.
      </p>
      <p className="text-[14px] leading-6 text-nv-text">
        Questions about this policy can be sent to{" "}
        <a
          href={`mailto:${tenant.authority.contactEmail}`}
          className="font-semibold text-nv-primary hover:underline"
        >
          {tenant.authority.contactEmail}
        </a>
        .
      </p>
    </LegalShell>
  );
}

function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 pb-nav lg:pb-10">
      <BackButton fallback="/" />

      <header className="flex items-center gap-3">
        <span className="nv-grad-profile grid h-11 w-11 place-items-center rounded-xl text-white">
          <FileText className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-[24px] font-extrabold leading-7 tracking-tight text-nv-ink">
            {title}
          </h1>
          <p className="text-[12px] text-nv-muted">{tenant.authority.name}</p>
        </div>
      </header>

      <Card>
        <CardContent className="space-y-4 p-5">{children}</CardContent>
      </Card>
    </div>
  );
}