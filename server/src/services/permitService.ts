import type { Role } from "@prisma/client";
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
      data: { status: newStatus, version: { increment: 1 } },
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