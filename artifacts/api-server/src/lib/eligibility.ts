import type { Opportunity, User } from "@workspace/db";

export type EligibilityStatus =
  | "ELIGIBLE"
  | "POSSIBLY_ELIGIBLE"
  | "NOT_ELIGIBLE";

type EligibilityInput = Pick<
  User,
  "age" | "category" | "degree" | "branch"
>;

const degreeRank: Record<string, number> = {
  SECONDARY: 0,
  DIPLOMA: 1,
  BACHELOR: 2,
  MASTER: 3,
  DOCTORATE: 4,
};

function normalizedBranch(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(engineering|engineer)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function checkEligibility(
  profile: EligibilityInput,
  opportunity: Pick<
    Opportunity,
    | "domain"
    | "minAge"
    | "maxAge"
    | "minDegree"
    | "allowedBranches"
  >,
): { status: EligibilityStatus; reasons: string[] } {
  const failures: string[] = [];
  const uncertainties: string[] = [];
  const reasons: string[] = [];

  if (profile.age < opportunity.minAge) {
    failures.push(`Minimum age is ${opportunity.minAge}; your age is ${profile.age}.`);
  } else if (opportunity.maxAge !== null && profile.age > opportunity.maxAge) {
    if (
      opportunity.domain === "GOVERNMENT" &&
      ["OBC", "SC", "ST"].includes(profile.category)
    ) {
      uncertainties.push(
        `Your age is above the general limit of ${opportunity.maxAge}; category-based relaxation may apply, so verify the official notification.`,
      );
    } else {
      failures.push(
        `Maximum age is ${opportunity.maxAge}; your age is ${profile.age}.`,
      );
    }
  } else {
    reasons.push(`Age requirement met (${profile.age} years).`);
  }

  const candidateDegreeRank = degreeRank[profile.degree];
  const requiredDegreeRank = degreeRank[opportunity.minDegree];
  if (candidateDegreeRank === undefined) {
    uncertainties.push(
      "Your qualification needs to be checked against the opportunity's official requirements.",
    );
  } else if (candidateDegreeRank < requiredDegreeRank) {
    failures.push(
      `A ${opportunity.minDegree.toLowerCase()} is required; your listed qualification is ${profile.degree.toLowerCase()}.`,
    );
  } else {
    reasons.push(
      `Qualification requirement met (${profile.degree.toLowerCase()}).`,
    );
  }

  const allowed = opportunity.allowedBranches;
  const unrestricted =
    allowed.length === 0 ||
    allowed.some((branch) => branch.trim().toLowerCase() === "any");
  const candidateBranch = normalizedBranch(profile.branch);
  if (unrestricted) {
    reasons.push("No specific branch restriction is listed.");
  } else if (
    ["", "unknown", "not sure", "not specified"].includes(candidateBranch)
  ) {
    uncertainties.push(
      "Your branch is not specific enough to confirm the listed branch requirement.",
    );
  } else {
    const permittedBranches = allowed.map(normalizedBranch);
    if (permittedBranches.includes(candidateBranch)) {
      reasons.push(`Branch requirement met (${profile.branch}).`);
    } else {
      failures.push(
        `This sample listing accepts these branches: ${allowed.join(", ")}.`,
      );
    }
  }

  if (failures.length > 0) {
    return { status: "NOT_ELIGIBLE", reasons: failures };
  }
  if (uncertainties.length > 0) {
    return { status: "POSSIBLY_ELIGIBLE", reasons: uncertainties };
  }
  return { status: "ELIGIBLE", reasons };
}
