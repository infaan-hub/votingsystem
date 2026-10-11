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
  /** Path to the ballot-box illustration used on the splash/welcome screens. */
  ballotMark: string;
  /**
   * Palette override. Any value omitted falls back to the NexVote defaults in
   * `globals.css`, so a tenant can restyle without duplicating the whole set.
   */
  colors: {
    primary: string;
    primary600: string;
    primary100: string;
    navy: string;
  };
  /** Brand colours injected into the PWA manifest and status bar. */
  themeColor: string;
  /** Supported UI locales, BCP-47 tags. The first entry is the default. */
  locales: string[];
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
    shortLabel: string;
    /** Placeholder, e.g. "AB-1234567" — illustrative only, never a real format. */
    placeholder: string;
    /** Regex the identifier must satisfy; null disables the check. */
    pattern: string | null;
    /** Message shown when the identifier does not match the pattern. */
    invalidMessage: string;
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
    /** Plural forms used in headings and empty states. */
    regionPlural: string;
    constituencyPlural: string;
  };
  /** Vocabulary for groups on the ballot. */
  groups: {
    /** e.g. "Party", "Slate", "Group", "Ticket" */
    singular: string;
    plural: string;
    /** Whether groups are shown at all (some ballots are non-partisan). */
    enabled: boolean;
  };
  /** Feature switches for the whole product. */
  features: {
    /** Require a one-time code sent to a phone number at registration. */
    phoneVerification: boolean;
    /** Identity/KYC review queue for administrators. */
    identityReview: boolean;
    /** Candidate ratings and public opinion threads. */
    ratingsAndOpinions: boolean;
    /** Live head-to-head counts while voting is open. */
    liveResults: boolean;
    /** Re-authentication (biometric or password) at the moment of casting. */
    voteReauthentication: boolean;
    /** Printable/verifiable receipt code after voting. */
    receipts: boolean;
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
  logo: "/logo.svg",
  ballotMark: "/ballot-mark.svg",
  colors: {
    primary: "#F0134D",
    primary600: "#D10E41",
    primary100: "#FFE3EB",
    navy: "#1E2A8A",
  },
  themeColor: "#F0134D",
  locales: ["en"],
  defaultLocale: "en",
  direction: "ltr",
  idType: {
    label: "Membership ID",
    shortLabel: "ID",
    placeholder: "XX-0000000",
    pattern: null,
    invalidMessage: "Enter a valid membership ID.",
    required: true,
  },
  geography: {
    region: "Region",
    constituency: "Constituency",
    regionPlural: "Regions",
    constituencyPlural: "Constituencies",
  },
  groups: {
    singular: "Party",
    plural: "Parties",
    enabled: true,
  },
  features: {
    phoneVerification: false,
    identityReview: false,
    ratingsAndOpinions: true,
    liveResults: true,
    voteReauthentication: true,
    receipts: true,
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
  shortName: tenant.shortName,
  tagline: tenant.tagline,
  region: tenant.geography.region,
  constituency: tenant.geography.constituency,
  regionPlural: tenant.geography.regionPlural,
  constituencyPlural: tenant.geography.constituencyPlural,
  party: tenant.groups.singular,
  partyPlural: tenant.groups.plural,
  groupsEnabled: tenant.groups.enabled,
  idLabel: tenant.idType.label,
  idShortLabel: tenant.idType.shortLabel,
  idPlaceholder: tenant.idType.placeholder,
  locales: tenant.locales,
};
