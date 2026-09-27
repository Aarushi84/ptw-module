import type { Permit, User } from "../types";

export interface PermitAction {
  key: string;
  label: string;
  variant: "primary" | "default" | "danger";
  needsComment?: boolean;
}

export function getAvailableActions(permit: Permit, user: User): PermitAction[] {
  const isOwnPermit = permit.requesterId === user.id;
  const actions: PermitAction[] = [];

  const canRequesterAct = (user.role === "REQUESTER" && isOwnPermit) || user.role === "ADMIN";
  const canSafetyAct = user.role === "SAFETY_OFFICER" || user.role === "ADMIN";

  switch (permit.status) {
    case "DRAFT":
      if (canRequesterAct) {
        actions.push({ key: "submit", label: "Submit for approval", variant: "primary" });
        actions.push({ key: "cancel", label: "Cancel permit", variant: "danger" });
      }
      break;
    case "PENDING_APPROVAL":
      if (canRequesterAct) actions.push({ key: "cancel", label: "Cancel permit", variant: "danger" });
      break;
    case "APPROVED":
      if (canRequesterAct || canSafetyAct) {
        actions.push({ key: "activate", label: "Activate permit", variant: "primary" });
      }
      if (canRequesterAct) actions.push({ key: "cancel", label: "Cancel permit", variant: "danger" });
      break;
    case "ACTIVE":
      if (canSafetyAct) actions.push({ key: "suspend", label: "Suspend permit", variant: "danger" });
      if (canRequesterAct) actions.push({ key: "close", label: "Mark work complete", variant: "primary", needsComment: true });
      break;
    case "SUSPENDED":
      if (canSafetyAct) actions.push({ key: "resume", label: "Resume permit", variant: "primary" });
      break;
    case "CLOSED":
      if (canSafetyAct && !isOwnPermit) {
        actions.push({ key: "verify", label: "Verify closure", variant: "primary" });
      }
      break;
  }

  return actions;
}