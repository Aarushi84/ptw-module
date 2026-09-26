export type Role = "REQUESTER" | "AREA_OWNER" | "SAFETY_OFFICER" | "ADMIN";
export type PermitType = "HOT_WORK" | "CONFINED_SPACE" | "WORKING_AT_HEIGHT" | "ELECTRICAL_LOTO";
export type PermitStatus =
  | "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "ACTIVE" | "SUSPENDED"
  | "CLOSED" | "CLOSED_VERIFIED" | "REJECTED" | "EXPIRED" | "CANCELLED";
export type Decision = "PENDING" | "APPROVED" | "REJECTED";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  areaId: string | null;
}

export interface Approval {
  id: string;
  permitId: string;
  requiredRole: Role;
  approverId: string | null;
  approver?: { id: string; name: string } | null;
  decision: Decision;
  comment: string | null;
  decidedAt: string | null;
}

export interface AuditLog {
  id: string;
  permitId: string;
  actorId: string;
  actor?: { name: string };
  action: string;
  fromStatus: PermitStatus | null;
  toStatus: PermitStatus | null;
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
  comment: string | null;
  createdAt: string;
}

export interface Permit {
  id: string;
  number: string;
  type: PermitType;
  status: PermitStatus;
  requesterId: string;
  requester?: { id: string; name: string; email?: string };
  contractorName: string;
  workDescription: string;
  areaId: string;
  area?: { id: string; name: string };
  equipmentId: string;
  equipment?: { id: string; tag: string; name: string };
  plannedStart: string;
  plannedEnd: string;
  hazards: string[];
  ppeRequired: string[];
  precautions: { text: string; done: boolean }[];
  typeData: Record<string, unknown>;
  completionNotes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  approvals?: Approval[];
  auditLogs?: AuditLog[];
}