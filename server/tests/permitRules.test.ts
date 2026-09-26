import { describe, it, expect } from "vitest";
import type { PermitStatus, Role } from "@prisma/client";
import {
  checkTransition, checkApprovalDecision, RuleError,
  type PermitLike, type UserLike,
} from "../src/services/permitRules";

const now = new Date("2026-09-25T10:00:00Z");

const permit = (o: Partial<PermitLike> = {}): PermitLike => ({
  status: "DRAFT" as PermitStatus,
  requesterId: "u-req",
  areaId: "area-1",
  plannedStart: new Date("2026-09-25T09:00:00Z"),
  plannedEnd: new Date("2026-09-25T17:00:00Z"),
  approvals: [],
  ...o,
});

const user = (id: string, role: Role, areaId: string | null = null): UserLike => ({ id, role, areaId });
const requester = user("u-req", "REQUESTER");
const safety = user("u-safe", "SAFETY_OFFICER");
const areaOwner = user("u-area", "AREA_OWNER", "area-1");

function codeOf(fn: () => unknown): number | null {
  try { fn(); } catch (e) { return (e as RuleError).status; }
  return null;
}

describe("state machine", () => {
  it("allows a valid transition", () => {
    expect(checkTransition("submit", permit(), requester, now)).toBe("PENDING_APPROVAL");
  });
  it("rejects an illegal transition with 409", () => {
    expect(codeOf(() => checkTransition("activate", permit(), requester, now))).toBe(409);
  });
  it("blocks any change on a terminal state", () => {
    const p = permit({ status: "CLOSED_VERIFIED" });
    expect(codeOf(() => checkTransition("cancel", p, safety, now))).toBe(409);
  });
  it("blocks the wrong role with 403", () => {
    const p = permit({ status: "ACTIVE" });
    expect(codeOf(() => checkTransition("suspend", p, requester, now))).toBe(403);
  });
  it("blocks a requester acting on someone else's permit", () => {
    const p = permit({ status: "DRAFT", requesterId: "someone-else" });
    expect(codeOf(() => checkTransition("submit", p, requester, now))).toBe(403);
  });
});

describe("activation rules", () => {
  const approved = permit({ status: "APPROVED", approvals: [{ decision: "APPROVED" }, { decision: "APPROVED" }] });
  it("activates when approved and inside the window", () => {
    expect(checkTransition("activate", approved, requester, now)).toBe("ACTIVE");
  });
  it("blocks activation before the planned start", () => {
    const early = new Date("2026-09-25T08:00:00Z");
    expect(codeOf(() => checkTransition("activate", approved, requester, early))).toBe(409);
  });
  it("blocks activation of an expired permit", () => {
    const late = new Date("2026-09-25T18:00:00Z");
    expect(codeOf(() => checkTransition("activate", approved, requester, late))).toBe(409);
  });
  it("blocks activation if any approval is still pending", () => {
    const p = permit({ status: "APPROVED", approvals: [{ decision: "APPROVED" }, { decision: "PENDING" }] });
    expect(codeOf(() => checkTransition("activate", p, requester, now))).toBe(409);
  });
  it("blocks resuming a suspended permit after expiry", () => {
    const p = permit({ status: "SUSPENDED" });
    const late = new Date("2026-09-25T18:00:00Z");
    expect(codeOf(() => checkTransition("resume", p, safety, late))).toBe(409);
  });
});

describe("approval rules", () => {
  const pending = permit({ status: "PENDING_APPROVAL" });
  it("blocks approving your own permit, even as safety officer", () => {
    const own = permit({ status: "PENDING_APPROVAL", requesterId: "u-safe" });
    expect(codeOf(() => checkApprovalDecision(own, safety, "SAFETY_OFFICER"))).toBe(403);
  });
  it("blocks a requester from approving", () => {
    expect(codeOf(() => checkApprovalDecision(pending, user("x", "REQUESTER"), "SAFETY_OFFICER"))).toBe(403);
  });
  it("blocks an area owner from another area", () => {
    const other = user("u-area2", "AREA_OWNER", "area-2");
    expect(codeOf(() => checkApprovalDecision(pending, other, "AREA_OWNER"))).toBe(403);
  });
  it("lets the right area owner approve", () => {
    expect(codeOf(() => checkApprovalDecision(pending, areaOwner, "AREA_OWNER"))).toBeNull();
  });
  it("blocks the requester from verifying their own closure", () => {
    const p = permit({ status: "CLOSED", requesterId: "u-safe" });
    expect(codeOf(() => checkTransition("verify", p, safety, now))).toBe(403);
  });
});