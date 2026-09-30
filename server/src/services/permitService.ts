import type { Role, PermitStatus } from "@prisma/client";
import { prisma } from "../db";
import {
  Action,
  RuleError,
  UserLike,
  checkApprovalDecision,
  checkTransition,
} from "./permitRules";

// Decision: every permit type needs the same two approvers.
// If a type needs different ones later, change this in one place.
const REQUIRED_APPROVERS: Role[] = ["AREA_OWNER", "SAFETY_OFFICER"];

const STALE_MESSAGE = "This permit was changed by someone else. Refresh and try again";

/** Submit, activate, suspend, resume, close, verify, cancel, expire. */
export async function transitionPermit(
  permitId: string,
  action: Action,
  user: UserLike,
  comment?: string
) {
  // Closing a permit needs completion notes
  if (action === "close" && !comment?.trim()) {
    throw new RuleError(400, "Completion notes are required to close a permit");
  }

  return prisma.$transaction(async (tx) => {
    const permit = await tx.permit.findUnique({
      where: { id: permitId },
      include: { approvals: true },
    });
    if (!permit) throw new RuleError(404, "Permit not found");

    // All the rules live in permitRules.ts
    const newStatus = checkTransition(action, permit, user);

    // Only update if nobody changed the permit since we read it
    const result = await tx.permit.updateMany({
      where: { id: permitId, version: permit.version },
      data: {
        status: newStatus,
        version: { increment: 1 },
        ...(action === "close" ? { completionNotes: comment!.trim() } : {}),
      },
    });
    if (result.count === 0) throw new RuleError(409, STALE_MESSAGE);

    if (action === "submit") {
      await tx.approval.createMany({
        data: REQUIRED_APPROVERS.map((requiredRole) => ({ permitId, requiredRole })),
      });
    }

    await tx.auditLog.create({
      data: {
        permitId,
        actorId: user.id,
        action: action.toUpperCase(),
        fromStatus: permit.status,
        toStatus: newStatus,
        comment: comment ?? null,
      },
    });

    return tx.permit.findUnique({
      where: { id: permitId },
      include: { approvals: true },
    });
  });
}

/** One approver approves or rejects one approval row. */
export async function decideApproval(
  permitId: string,
  approvalId: string,
  user: UserLike,
  decision: "APPROVED" | "REJECTED",
  comment?: string
) {
  if (decision === "REJECTED" && !comment?.trim()) {
    throw new RuleError(400, "A reason is required to reject a permit");
  }

  return prisma.$transaction(async (tx) => {
    const permit = await tx.permit.findUnique({
      where: { id: permitId },
      include: { approvals: true },
    });
    if (!permit) throw new RuleError(404, "Permit not found");

    const approval = permit.approvals.find((a) => a.id === approvalId);
    if (!approval) throw new RuleError(404, "Approval not found on this permit");
    if (approval.decision !== "PENDING") {
      throw new RuleError(409, "This approval has already been decided");
    }
    if (new Date() >= permit.plannedEnd) {
      throw new RuleError(409, "The permit's time window has passed. Raise a new permit");
    }

    checkApprovalDecision(permit, user, approval.requiredRole);

    // One person cannot fill two approval rows
    if (permit.approvals.some((a) => a.approverId === user.id)) {
      throw new RuleError(409, "You have already decided on this permit");
    }

    const decided = await tx.approval.updateMany({
      where: { id: approvalId, decision: "PENDING" },
      data: { decision, approverId: user.id, comment: comment ?? null, decidedAt: new Date() },
    });
    if (decided.count === 0) throw new RuleError(409, STALE_MESSAGE);

    const others = permit.approvals.filter((a) => a.id !== approvalId);
    let newStatus = permit.status;
    if (decision === "REJECTED") newStatus = "REJECTED";
    else if (others.every((a) => a.decision === "APPROVED")) newStatus = "APPROVED";

    // Always bump the version. If two approvers act together, the second one
    // gets a 409 and its approval is rolled back, so no approval is lost.
    const result = await tx.permit.updateMany({
      where: { id: permitId, version: permit.version },
      data: { status: newStatus, version: { increment: 1 } },
    });
    if (result.count === 0) throw new RuleError(409, STALE_MESSAGE);

    await tx.auditLog.create({
      data: {
        permitId,
        actorId: user.id,
        action: decision === "APPROVED" ? "APPROVE" : "REJECT",
        fromStatus: permit.status,
        toStatus: newStatus,
        comment: comment ?? null,
      },
    });

    return tx.permit.findUnique({
      where: { id: permitId },
      include: { approvals: true },
    });
  });
}

// ---------------------------------------------------------------------------
// Automatic expiry
// ---------------------------------------------------------------------------

const SYSTEM_EMAIL = "system@ptw.local";

// Statuses that stop being valid once plannedEnd has passed
const EXPIRABLE: PermitStatus[] = ["PENDING_APPROVAL", "APPROVED", "ACTIVE", "SUSPENDED"];

// The audit log needs a user for every entry. Expiry has no human, so we use
// a "System" user. Its password hash is "!", so nobody can log in as it.
async function getSystemUserId() {
  const u = await prisma.user.upsert({
    where: { email: SYSTEM_EMAIL },
    update: {},
    create: { name: "System", email: SYSTEM_EMAIL, passwordHash: "!", role: "ADMIN" },
  });
  return u.id;
}

/** Moves every overdue permit to EXPIRED and writes an audit entry. Returns how many. */
export async function expireOverduePermits(now = new Date()) {
  const overdue = await prisma.permit.findMany({
    where: { status: { in: EXPIRABLE }, plannedEnd: { lte: now } },
    select: { id: true },
  });
  if (overdue.length === 0) return 0;

  const systemId = await getSystemUserId();
  const systemUser: UserLike = { id: systemId, role: "ADMIN", areaId: null };
  let count = 0;

  for (const { id } of overdue) {
    await prisma.$transaction(async (tx) => {
      const p = await tx.permit.findUnique({ where: { id }, include: { approvals: true } });
      if (!p) return;

      // The rule "only expire after plannedEnd" stays in permitRules.ts
      let newStatus: PermitStatus;
      try {
        newStatus = checkTransition("expire", p, systemUser, now);
      } catch (e) {
        if (e instanceof RuleError) return; // not expirable right now, skip it
        throw e;
      }

      const r = await tx.permit.updateMany({
        where: { id, version: p.version },
        data: { status: newStatus, version: { increment: 1 } },
      });
      if (r.count === 0) return; // someone changed it at the same moment

      await tx.auditLog.create({
        data: {
          permitId: id,
          actorId: systemId,
          action: "EXPIRE",
          fromStatus: p.status,
          toStatus: newStatus,
          comment: "Validity window passed. Expired automatically.",
        },
      });
      count++;
    });
  }
  return count;
}