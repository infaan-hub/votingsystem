/**
 * Tenant configuration.
 *
 * The platform is deliberately region-agnostic: no country, flag, state name or
 * party name is hardcoded anywhere in the product. Everything below is
 * brand-neutral or tenant-supplied, so the same build serves a national
 * election, a campus poll, a union vote or a corporate referendum by editing
 * this single file (or overriding it per deployment).
 *
 * Override values through environment variables where a secret or tenant id is
 * required; everything else is safe to edit here.
 */

export type TenantConfig = {
  /** Product / tenant display name. */
  name: string;
  /** Short name for tight spaces and the PWA manifest. */
  shortName: string;
  /** One-line positioning shown on the splash screen. */
  tagline: string;
  /** Absolute or root-relative path to the tenant logo. */
  logo: string;
  /** Brand colours injected into the PWA manifest and status bar. */
  themeColor: string;
  /** BCP-47 tag of the default UI language. */
  defaultLocale: string;
  /** Writing direction of the default locale. */
  direction: "ltr" | "rtl";
  /**
   * How a person's government/organisation identifier is labelled and
   * validated. `nationalId` becomes `Student ID`, `Member No.`, `Employee ID`
   * or anything else the tenant needs.
   */
  idType: {
    label: string;
    /** Placeholder, e.g. "AB-1234567" — illustrative only, never a real format. */
    placeholder: string;
    /** Whether the identifier is required to complete a profile. */
    required: boolean;
  };
  /**
   * Geography vocabulary. Generic by default so nothing implies a country.
   */
  geography: {
    /** e.g. "Region", "Zone", "District", "Province" */
    region: string;
    /** e.g. "Constituency", "Ward", "Branch", "Department" */
    constituency: string;
    /** Plural form used in headings and empty states. */
    constituencyPlural: string;
  };
  /** Feature switches for the whole product. */
  features: {
    /** Require a one-time code sent to a phone number at registration. */
    phoneVerification: boolean;
  };
  /** Contact + legal surfaces rendered in the footer. */
  authority: {
    /** Body running the election, e.g. "Electoral Commission". */
    name: string;
    contactEmail: string;
    privacyUrl: string;
    termsUrl: string;
  };
};

/**
 * Default tenant. Deliberately neutral: "Region", "Constituency", "Party",
 * no flag, no country. Copy this file and change the strings to deploy for a
 * specific organisation.
 */
const tenant: TenantConfig = {
  name: "NexVote",
  shortName: "NexVote",
  tagline: "Secure voting for every organisation",
  logo: "/nexvote_logo.jpeg",
  themeColor: "#FFFFFF",
  defaultLocale: "en",
  direction: "ltr",
  idType: {
    label: "Username",
    placeholder: "e.g. alice",
    required: true,
  },
  geography: {
    region: "Region",
    constituency: "Constituency",
    constituencyPlural: "Constituencies",
  },
  features: {
    phoneVerification: false,
  },
  authority: {
    name: "Electoral Office",
    contactEmail: "elections@example.org",
    privacyUrl: "/privacy",
    termsUrl: "/terms",
  },
};

export default tenant;

/** Convenience accessors so screens never reach into the raw object. */
export const t = {
  name: tenant.name,
  region: tenant.geography.region,
  constituency: tenant.geography.constituency,
  idLabel: tenant.idType.label,
  idPlaceholder: tenant.idType.placeholder,
};
