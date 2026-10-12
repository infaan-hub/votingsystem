"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Mail, Send, ShieldCheck } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { PageHeader } from "@/src/components/ui/page-header";
import { Section } from "@/src/components/ui/section";
import { Textarea } from "@/src/components/ui/textarea";
import tenant from "@/config/tenant";

type FieldErrors = Record<string, string[]>;

function readFieldErrors(body: unknown): FieldErrors {
  if (!body || typeof body !== "object") return {};
  const result: FieldErrors = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      result[key] = value.map((entry) => String(entry));
    } else if (typeof value === "string") {
      result[key] = [value];
    }
  }
  return result;
}

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError("");

    const localErrors: FieldErrors = {};
    if (!name.trim()) localErrors.name = ["This field is required."];
    if (!email.trim()) localErrors.email = ["This field is required."];
    if (!subject.trim()) localErrors.subject = ["This field is required."];
    if (message.trim().length < 10) {
      localErrors.message = ["Your message must be at least 10 characters long."];
    }
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as unknown;
        const fieldErrors = readFieldErrors(body);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          setFormError("Please fix the highlighted problems and send the message again.");
        } else {
          setFormError("We could not send your message right now. Please try again shortly.");
        }
        return;
      }
      setSent(true);
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch {
      setFormError("We could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contact support"
        description="Questions about an election, your account, or the platform? Send a message to the team running this service."
      />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Section title={sent ? undefined : "Send a message"}>
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-nv-success/15 text-nv-success">
                <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
              </span>
              <h2 className="text-fluid-lg text-nv-ink">Message sent</h2>
              <p className="max-w-sm text-[13.5px] leading-relaxed text-nv-muted">
                Thanks for reaching out. The support team has received your message and will reply
                to the email address you provided.
              </p>
              <Button
                variant="outline"
                className="mt-2 sm:w-auto"
                onClick={() => setSent(false)}
              >
                Send another message
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="max-w-2xl space-y-4" noValidate>
              {formError ? (
                <p
                  role="alert"
                  className="rounded-nv-md border border-nv-danger/40 bg-nv-danger/10 px-3 py-2.5 text-[13px] text-nv-danger"
                >
                  {formError}
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Your name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  invalid={!!errors.name}
                  error={errors.name?.[0]}
                />
                <Input
                  label="Email address"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  invalid={!!errors.email}
                  error={errors.email?.[0]}
                />
              </div>

              <Input
                label="Subject"
                required
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                invalid={!!errors.subject}
                error={errors.subject?.[0]}
              />

              <Textarea
                label="Message"
                required
                rows={6}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                hint="At least 10 characters. Include the election name if your question is about a specific vote."
                placeholder="How can we help?"
                invalid={!!errors.message}
                error={errors.message?.[0]}
              />

              <Button type="submit" disabled={submitting} className="sm:w-auto">
                <Send className="h-4 w-4" aria-hidden="true" />
                {submitting ? "Sending…" : "Send message"}
              </Button>
            </form>
          )}
        </Section>

        <div className="space-y-5">
          <Section title="Support information">
            <dl className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-nv-primary-100 text-nv-ink">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <dt className="text-[12px] font-bold uppercase tracking-[0.6px] text-nv-muted">
                    Run by
                  </dt>
                  <dd className="mt-0.5 text-[14px] font-semibold text-nv-ink">
                    {tenant.authority.name}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-nv-primary-100 text-nv-ink">
                  <Mail className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <dt className="text-[12px] font-bold uppercase tracking-[0.6px] text-nv-muted">
                    Email
                  </dt>
                  <dd className="mt-0.5 break-all text-[14px] font-semibold text-nv-ink">
                    <a
                      href={`mailto:${tenant.authority.contactEmail}`}
                      className="rounded-md text-nv-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary"
                    >
                      {tenant.authority.contactEmail}
                    </a>
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-nv-primary-100 text-nv-ink">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <dt className="text-[12px] font-bold uppercase tracking-[0.6px] text-nv-muted">
                    Response time
                  </dt>
                  <dd className="mt-0.5 text-[14px] font-semibold text-nv-ink">
                    Messages are reviewed by the support team in the order they arrive.
                  </dd>
                </div>
              </div>
            </dl>
          </Section>

          <Section title="Legal">
            <p className="text-[13.5px] leading-relaxed text-nv-muted">
              How your data is handled and the terms that apply while you use this service.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="dense">
                <Link href={tenant.authority.privacyUrl || "/privacy"}>Privacy policy</Link>
              </Button>
              <Button asChild variant="outline" size="dense">
                <Link href={tenant.authority.termsUrl || "/terms"}>Terms of service</Link>
              </Button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
