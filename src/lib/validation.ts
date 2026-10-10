import { parseDateTime } from "@/src/lib/time";
import { isValidEmail } from "@/src/lib/fields";

/**
 * Field-error carrier: either a field -> messages mapping or plain messages.
 * Thrown by the `validate*` helpers and converted to an HTTP 400 body by
 * `validationErrorBody`.
 */
export class ValidationError extends Error {
  readonly errorDict: Record<string, string[]> | null;
  readonly messages: string[];

  constructor(errorDict: Record<string, string[]> | null, messages?: string[]) {
    super(messages?.join("\n") ?? Object.values(errorDict ?? {}).flat().join("\n"));
    this.name = "ValidationError";
    this.errorDict = errorDict;
    this.messages =
      messages ?? Object.values(errorDict ?? {}).flat();
  }

  static fromMessage(message: string): ValidationError {
    return new ValidationError(null, [message]);
  }

  static fromDict(dict: Record<string, string | string[]>): ValidationError {
    const normalized: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(dict)) {
      normalized[key] = Array.isArray(value) ? value : [value];
    }
    return new ValidationError(normalized);
  }
}

/**
 * Converts a `ValidationError` into the 400 response body. Field-error values
 * stay lists; plain messages become `{"detail": str}`.
 */
export function validationErrorBody(
  error: ValidationError,
): Record<string, unknown> {
  if (error.errorDict && Object.keys(error.errorDict).length > 0) {
    return error.errorDict;
  }
  if (error.messages.length) {
    return { detail: error.messages[0] };
  }
  return { detail: "Submitted data is not valid." };
}

export function pythonTextCompare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

type UniqueChecker = (field: "username" | "google_id", value: string, excludeId?: number) => Promise<boolean>;

const defaultUniqueChecker: UniqueChecker = async () => false;

/**
 * Validates a user for create/update. Field-error strings are fixed API
 * contract values and must not change.
 */
export async function validateUser(
  user: {
    id?: number;
    username: string;
    email: string;
    role: string;
    registrationNumber?: string;
    staffId?: string;
    departmentId?: number | null;
    sectionId?: number | null;
    sectionDepartmentId?: number | null;
    googleId?: string | null;
  },
  isUnique: UniqueChecker = defaultUniqueChecker,
): Promise<void> {
  const errors: Record<string, string[]> = {};

  const username = user.username ?? "";
  if (!username) {
    errors.username = ["This field cannot be blank."];
  } else {
    const usernameErrors: string[] = [];
    if (!/^[\w.@+-]+$/u.test(username)) {
      usernameErrors.push(
        "Enter a valid username. This value may contain only letters, numbers, and @/./+/-/_ characters.",
      );
    }
    if (username.length > 150) {
      usernameErrors.push(
        `Ensure this value has at most 150 characters (it has ${username.length}).`,
      );
    }
    if (usernameErrors.length) errors.username = usernameErrors;
  }

  const role = user.role ?? "";
  const validRoles = ["student", "staff", "officer", "admin"];
  if (role && !validRoles.includes(role)) {
    errors.role = [`Value '${role}' is not a valid choice.`];
  }

  const email = user.email ?? "";
  if (email && !isValidEmail(email)) {
    errors.email = ["Enter a valid email address."];
  }

  if (
    user.sectionId &&
    user.departmentId &&
    user.sectionDepartmentId &&
    user.departmentId !== user.sectionDepartmentId
  ) {
    errors.section = ["The selected section must belong to the selected department."];
  }

  if (username) {
    if (user.googleId && (await isUnique("google_id", user.googleId, user.id))) {
      (errors.google_id ??= []).push("custom user with this google id already exists.");
    }
    if (await isUnique("username", username, user.id)) {
      (errors.username ??= []).push("A user with that username already exists.");
    }
  }

  if (Object.keys(errors).length) {
    throw ValidationError.fromDict(errors);
  }
}

/** Validates election title/description and schedule ordering. */
export function validateElection(election: {
  title: string;
  campaignStartAt: Date | null;
  campaignEndAt: Date | null;
  votingStartAt: Date | null;
  votingEndAt: Date | null;
}): void {
  const errors: Record<string, string[]> = {};

  if (!election.title || !election.title.trim()) {
    errors.title = ["This field cannot be blank."];
  } else if (election.title.length > 180) {
    errors.title = [`Ensure this value has at most 180 characters (it has ${election.title.length}).`];
  }

  for (const [field, value] of [
    ["campaign_start_at", election.campaignStartAt],
    ["campaign_end_at", election.campaignEndAt],
    ["voting_start_at", election.votingStartAt],
    ["voting_end_at", election.votingEndAt],
  ] as const) {
    if (!value) {
      errors[field] = ["This field cannot be null."];
    }
  }

  const { campaignStartAt, campaignEndAt, votingStartAt, votingEndAt } = election;

  // `Election.clean()` raises on the first failing rule, so only one
  // message can ever surface from the cross-field date checks.
  if (campaignStartAt && campaignEndAt && campaignStartAt >= campaignEndAt) {
    errors.campaign_end_at = ["Campaign end time must be after campaign start time."];
  } else if (votingStartAt && votingEndAt && votingStartAt >= votingEndAt) {
    errors.voting_end_at = ["Voting end time must be after voting start time."];
  } else if (campaignStartAt && votingStartAt && campaignStartAt > votingStartAt) {
    errors.campaign_start_at = ["Campaign start time must not be after voting start time."];
  } else if (campaignEndAt && votingEndAt && campaignEndAt > votingEndAt) {
    errors.campaign_end_at = ["Campaign end time must not be after voting end time."];
  }

  if (Object.keys(errors).length) {
    throw ValidationError.fromDict(errors);
  }
}

/** Validates a position name and its department/section scope. */
export function validatePosition(position: {
  name: string;
  departmentId?: number | null;
  sectionId?: number | null;
  sectionDepartmentId?: number | null;
}): void {
  const errors: Record<string, string[]> = {};
  const name = position.name ?? "";

  if (!name) {
    errors.name = ["This field cannot be blank."];
  } else if (name.length > 120) {
    errors.name = [`Ensure this value has at most 120 characters (it has ${name.length}).`];
  }

  if (
    position.sectionId &&
    position.departmentId &&
    position.sectionDepartmentId &&
    position.departmentId !== position.sectionDepartmentId
  ) {
    errors.section = ["The selected section must belong to the selected department."];
  }

  if (Object.keys(errors).length) {
    throw ValidationError.fromDict(errors);
  }
}

/** Validates a candidate against its election, position and user. */
export function validateCandidate(candidate: {
  electionId?: number | null;
  positionElectionId?: number | null;
  departmentId?: number | null;
  sectionId?: number | null;
  sectionDepartmentId?: number | null;
  userDepartmentId?: number | null;
  userSectionId?: number | null;
  positionDepartmentId?: number | null;
  positionSectionId?: number | null;
  slogan?: string;
  manifesto?: string;
  campaignVideoUrl?: string;
}): void {
  const errors: Record<string, string[]> = {};

  if (candidate.slogan && candidate.slogan.length > 180) {
    errors.slogan = ["'slogan' has a maximum length of 180 characters."];
  }

  if (
    candidate.electionId &&
    candidate.positionElectionId &&
    candidate.electionId !== candidate.positionElectionId
  ) {
    errors.position = ["The position must belong to the selected election."];
  }

  if (
    candidate.sectionId &&
    candidate.departmentId &&
    candidate.sectionDepartmentId &&
    candidate.departmentId !== candidate.sectionDepartmentId
  ) {
    errors.section = ["The selected section must belong to the selected department."];
  }

  if (
    candidate.positionDepartmentId !== undefined &&
    candidate.positionDepartmentId !== null &&
    candidate.userDepartmentId !== candidate.positionDepartmentId
  ) {
    errors.user = ["The candidate must belong to the position department."];
  } else if (
    candidate.positionSectionId !== undefined &&
    candidate.positionSectionId !== null &&
    candidate.userSectionId !== candidate.positionSectionId
  ) {
    errors.user = ["The candidate must belong to the position section."];
  }

  if (Object.keys(errors).length) {
    throw ValidationError.fromDict(errors);
  }
}

export { parseDateTime };
