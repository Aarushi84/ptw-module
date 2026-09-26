import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { validateTypeData, ValidationError } from "../validation/permitTypes";
import { transitionPermit, decideApproval } from "../services/permitService";
import { RuleError } from "../services/permitRules";

export const permitRouter = Router();
permitRouter.use(requireAuth);

function handleError(err: unknown, res: any) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ message: "Validation failed", issues: err.issues });
  }
  if (err instanceof RuleError) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(err);
  return res.status(500).json({ message: "Something went wrong" });
}

async function nextPermitNumber() {
  const count = await prisma.permit.count();
  return `PTW-${String(count + 1).padStart(4, "0")}`;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function paramId(req: any, key: string): string {
  return req.params[key] as string;
}

// CREATE (draft) — Requester only
permitRouter.post("/", requireRole(["REQUESTER", "ADMIN"]), async (req, res) => {
  try {
    const b = req.body ?? {};
    const required = ["type", "contractorName", "workDescription", "areaId", "equipmentId", "plannedStart", "plannedEnd"];
    for (const field of required) {
      if (!b[field]) return res.status(400).json({ message: `${field} is required` });
    }
    if (isNaN(new Date(b.plannedStart).getTime()) || isNaN(new Date(b.plannedEnd).getTime())) {
      return res.status(400).json({ message: "plannedStart and plannedEnd must be valid dates" });
    }
    if (new Date(b.plannedEnd) <= new Date(b.plannedStart)) {
      return res.status(400).json({ message: "plannedEnd must be after plannedStart" });
    }
    if (b.hazards !== undefined && !isStringArray(b.hazards)) {
      return res.status(400).json({ message: "hazards must be an array of strings" });
    }
    if (b.ppeRequired !== undefined && !isStringArray(b.ppeRequired)) {
      return res.status(400).json({ message: "ppeRequired must be an array of strings" });
    }

    const permit = await prisma.permit.create({
      data: {
        number: await nextPermitNumber(),
        type: b.type,
        requesterId: req.user!.id,
        contractorName: String(b.contractorName),
        workDescription: String(b.workDescription),
        areaId: b.areaId,
        equipmentId: b.equipmentId,
        plannedStart: new Date(b.plannedStart),
        plannedEnd: new Date(b.plannedEnd),
        hazards: b.hazards ?? [],
        ppeRequired: b.ppeRequired ?? [],
        precautions: b.precautions ?? [],
        typeData: b.typeData ?? {},
      },
    });

    await prisma.auditLog.create({
      data: { permitId: permit.id, actorId: req.user!.id, action: "CREATE", toStatus: "DRAFT" },
    });

    res.status(201).json(permit);
  } catch (err) {
    handleError(err, res);
  }
});

// LIST — filterable
permitRouter.get("/", async (req, res) => {
  try {
    const { status, type, areaId, from, to, mine } = req.query as Record<string, string>;
    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (areaId) where.areaId = areaId;
    if (from || to) {
      where.plannedStart = {};
      if (from) where.plannedStart.gte = new Date(from);
      if (to) where.plannedStart.lte = new Date(to);
    }
    if (mine === "pendingApproval") {
      where.status = "PENDING_APPROVAL";
      where.approvals = { some: { decision: "PENDING", requiredRole: req.user!.role } };
      if (req.user!.role === "AREA_OWNER") where.areaId = req.user!.areaId;
    }

    const permits = await prisma.permit.findMany({
      where,
      include: {
        area: true,
        equipment: true,
        requester: { select: { id: true, name: true } },
        approvals: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(permits);
  } catch (err) {
    handleError(err, res);
  }
});

// DETAIL
permitRouter.get("/:id", async (req, res) => {
  try {
    const permit = await prisma.permit.findUnique({
      where: { id: paramId(req, "id") },
      include: {
        area: true,
        equipment: true,
        requester: { select: { id: true, name: true, email: true } },
        approvals: { include: { approver: { select: { id: true, name: true } } } },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          include: { actor: { select: { name: true } } },
        },
      },
    });
    if (!permit) return res.status(404).json({ message: "Permit not found" });
    res.json(permit);
  } catch (err) {
    handleError(err, res);
  }
});

// UPDATE — only while DRAFT, requester of that permit only
permitRouter.patch("/:id", requireRole(["REQUESTER", "ADMIN"]), async (req, res) => {
  try {
    const permit = await prisma.permit.findUnique({ where: { id: paramId(req, "id") } });
    if (!permit) return res.status(404).json({ message: "Permit not found" });
    if (permit.status !== "DRAFT") {
      return res.status(409).json({ message: "Only draft permits can be edited" });
    }
    if (req.user!.role === "REQUESTER" && permit.requesterId !== req.user!.id) {
      return res.status(403).json({ message: "You can only edit your own permits" });
    }

    const editableFields = [
      "contractorName",
      "workDescription",
      "plannedStart",
      "plannedEnd",
      "hazards",
      "ppeRequired",
      "precautions",
      "typeData",
    ] as const;

    const changes: Record<string, unknown> = {};
    const logs: {
      permitId: string;
      actorId: string;
      action: string;
      field: string;
      oldValue: Prisma.InputJsonValue;
      newValue: Prisma.InputJsonValue;
    }[] = [];

    for (const field of editableFields) {
      if (!(field in req.body)) continue;

      if ((field === "hazards" || field === "ppeRequired") && !isStringArray(req.body[field])) {
        return res.status(400).json({ message: `${field} must be an array of strings` });
      }

      const incoming: unknown =
        field === "plannedStart" || field === "plannedEnd"
          ? new Date(req.body[field])
          : req.body[field];

      const current = (permit as Record<string, unknown>)[field];
      if (JSON.stringify(incoming) !== JSON.stringify(current)) {
        changes[field] = incoming;
        logs.push({
          permitId: permit.id,
          actorId: req.user!.id,
          action: "EDIT",
          field,
          oldValue: (current ?? null) as Prisma.InputJsonValue,
          newValue: (req.body[field] ?? null) as Prisma.InputJsonValue,
        });
      }
    }

    if (Object.keys(changes).length === 0) return res.json(permit);

    const updated = await prisma.permit.update({
      where: { id: permit.id },
      data: { ...changes, version: { increment: 1 } },
    });
    if (logs.length) await prisma.auditLog.createMany({ data: logs });
    res.json(updated);
  } catch (err) {
    handleError(err, res);
  }
});

// SUBMIT — runs full type validation before allowing it out of DRAFT
permitRouter.post("/:id/submit", async (req, res) => {
  try {
    const permit = await prisma.permit.findUnique({ where: { id: paramId(req, "id") } });
    if (!permit) return res.status(404).json({ message: "Permit not found" });
    validateTypeData(permit.type, permit.typeData);
    const updated = await transitionPermit(paramId(req, "id"), "submit", req.user!, req.body?.comment);
    res.json(updated);
  } catch (err) {
    handleError(err, res);
  }
});

// Generic transitions
const actions = ["activate", "suspend", "resume", "close", "verify", "cancel"] as const;
for (const action of actions) {
  permitRouter.post(`/:id/${action}`, async (req, res) => {
    try {
      const updated = await transitionPermit(paramId(req, "id"), action, req.user!, req.body?.comment);
      res.json(updated);
    } catch (err) {
      handleError(err, res);
    }
  });
}

// APPROVE / REJECT one approval row
permitRouter.post("/:id/approvals/:approvalId/decide", async (req, res) => {
  try {
    const { decision, comment } = req.body ?? {};
    if (!["APPROVED", "REJECTED"].includes(decision)) {
      return res.status(400).json({ message: "decision must be APPROVED or REJECTED" });
    }
    const updated = await decideApproval(
      paramId(req, "id"),
      paramId(req, "approvalId"),
      req.user!,
      decision,
      comment
    );
    res.json(updated);
  } catch (err) {
    handleError(err, res);
  }
});