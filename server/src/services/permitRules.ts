import type { PermitStatus, Role } from "@prisma/client";

export class RuleError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Action =
  | "submit" | "activate" | "suspend" | "resume"
  | "close" | "verify" | "cancel" | "expire";

export interface UserLike {
  id: string;
  role: Role;
  areaId: string | null;
}

export interface PermitLike {
  status: PermitStatus;
  requesterId: string;
  areaId: string;
  plannedStart: Date;
  plannedEnd: Date;
  approvals: { decision: "PENDING" | "APPROVED" | "REJECTED" }[];
}

interface Rule {
  to: PermitStatus;
  roles: Role[];
  requesterOnly?: boolean; // a REQUESTER may only act on their own permit
  noSelf?: boolean; // the person who raised the permit cannot do this
}

const RULES: Record<Action, Partial<Record<PermitStatus, Rule>>> = {
  submit: {
    DRAFT: { to: "PENDING_APPROVAL", roles: ["REQUESTER", "ADMIN"], requesterOnly: true },
  },
  activate: {
    APPROVED: { to: "ACTIVE", roles: ["REQUESTER", "SAFETY_OFFICER", "ADMIN"], requesterOnly: true },
  },
  suspend: {
    ACTIVE: { to: "SUSPENDED", roles: ["SAFETY_OFFICER", "ADMIN"] },
  },
  resume: {
    SUSPENDED: { to: "ACTIVE", roles: ["SAFETY_OFFICER", "ADMIN"] },
  },
  close: {
    ACTIVE: { to: "CLOSED", roles: ["REQUESTER", "ADMIN"], requesterOnly: true },
  },
  verify: {
    CLOSED: { to: "CLOSED_VERIFIED", roles: ["SAFETY_OFFICER", "ADMIN"], noSelf: true },
  },
  cancel: {
    DRAFT: { to: "CANCELLED", roles: ["REQUESTER", "SAFETY_OFFICER", "ADMIN"], requesterOnly: true },
    PENDING_APPROVAL: { to: "CANCELLED", roles: ["REQUESTER", "SAFETY_OFFICER", "ADMIN"], requesterOnly: true },
    APPROVED: { to: "CANCELLED", roles: ["REQUESTER", "SAFETY_OFFICER", "ADMIN"], requesterOnly: true },
    ACTIVE: { to: "CANCELLED", roles: ["REQUESTER", "SAFETY_OFFICER", "ADMIN"], requesterOnly: true },
    SUSPENDED: { to: "CANCELLED", roles: ["REQUESTER", "SAFETY_OFFICER", "ADMIN"], requesterOnly: true },
  },
  // "expire" is run by the system, so any role is accepted
  expire: {
    PENDING_APPROVAL: { to: "EXPIRED", roles: ["REQUESTER", "AREA_OWNER", "SAFETY_OFFICER", "ADMIN"] },
    APPROVED: { to: "EXPIRED", roles: ["REQUESTER", "AREA_OWNER", "SAFETY_OFFICER", "ADMIN"] },
    ACTIVE: { to: "EXPIRED", roles: ["REQUESTER", "AREA_OWNER", "SAFETY_OFFICER", "ADMIN"] },
    SUSPENDED: { to: "EXPIRED", roles: ["REQUESTER", "AREA_OWNER", "SAFETY_OFFICER", "ADMIN"] },
  },
};

/** Returns the new status, or throws a RuleError with a clear message. */
export function checkTransition(
  action: Action,
  permit: PermitLike,
  user: UserLike,
  now: Date = new Date()
): PermitStatus {
  const rule = RULES[action][permit.status];
  if (!rule) {
    throw new RuleError(409, `Cannot ${action} a permit that is ${permit.status}`);
  }
  if (!rule.roles.includes(user.role)) {
    throw new RuleError(403, `Role ${user.role} cannot ${action} a permit`);
  }
  const isRequester = permit.requesterId === user.id;
  if (rule.requesterOnly && user.role === "REQUESTER" && !isRequester) {
    throw new RuleError(403, "You can only do this on your own permits");
  }
  if (rule.noSelf && isRequester) {
    throw new RuleError(403, "You cannot do this on your own permit");
  }

  if (action === "activate" || action === "resume") {
    if (now >= permit.plannedEnd) {
      throw new RuleError(409, "Permit has expired. Raise a new permit");
    }
  }
  if (action === "activate") {
    if (now < permit.plannedStart) {
      throw new RuleError(409, "Permit cannot start before its planned start time");
    }
    const all = permit.approvals.length > 0 && permit.approvals.every((a) => a.decision === "APPROVED");
    if (!all) {
      throw new RuleError(409, "Every required approver must approve first");
    }
  }
  if (action === "expire" && now < permit.plannedEnd) {
    throw new RuleError(409, "Permit is still within its validity window");
  }
  return rule.to;
}

/** Checks that this user may approve or reject one approval row. */
export function checkApprovalDecision(
  permit: PermitLike,
  user: UserLike,
  requiredRole: Role
): void {
  if (permit.status !== "PENDING_APPROVAL") {
    throw new RuleError(409, `Permit is ${permit.status}, not waiting for approval`);
  }
  if (permit.requesterId === user.id) {
    throw new RuleError(403, "You cannot approve your own permit");
  }
  if (user.role === "ADMIN") return;
  if (user.role !== requiredRole) {
    throw new RuleError(403, `This approval needs the ${requiredRole} role`);
  }
  if (user.role === "AREA_OWNER" && user.areaId !== permit.areaId) {
    throw new RuleError(403, "You can only approve permits in your own area");
  }
}