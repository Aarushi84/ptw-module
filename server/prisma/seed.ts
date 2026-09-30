import { PrismaClient, type PermitStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "password123";
const HOUR = 60 * 60 * 1000;

async function main() {
  console.log("Clearing existing data...");
  await prisma.auditLog.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.permit.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.area.deleteMany();
  await prisma.plant.deleteMany();
  await prisma.user.deleteMany();

  const hash = await bcrypt.hash(PASSWORD, 10);

  // Plants
  const plantA = await prisma.plant.create({ data: { name: "Chennai Plant 1" } });
  const plantB = await prisma.plant.create({ data: { name: "Chennai Plant 2" } });

  // Areas
  const areaBoiler = await prisma.area.create({ data: { name: "Boiler House", plantId: plantA.id } });
  const areaTankFarm = await prisma.area.create({ data: { name: "Tank Farm", plantId: plantA.id } });
  const areaWorkshop = await prisma.area.create({ data: { name: "Workshop", plantId: plantB.id } });

  // Users — one per role
  const requester = await prisma.user.create({
    data: { name: "Ravi Kumar", email: "requester@ptw.test", passwordHash: hash, role: "REQUESTER" },
  });
  const areaOwner = await prisma.user.create({
    data: { name: "Priya Nair", email: "areaowner@ptw.test", passwordHash: hash, role: "AREA_OWNER", areaId: areaBoiler.id },
  });
  const safetyOfficer = await prisma.user.create({
    data: { name: "Suresh Iyer", email: "safety@ptw.test", passwordHash: hash, role: "SAFETY_OFFICER" },
  });
  await prisma.user.create({
    data: { name: "Admin User", email: "admin@ptw.test", passwordHash: hash, role: "ADMIN" },
  });

  // Equipment (6, spread across areas)
  const eq1 = await prisma.equipment.create({ data: { tag: "BLR-101", name: "Boiler Feed Pump", areaId: areaBoiler.id } });
  const eq2 = await prisma.equipment.create({ data: { tag: "BLR-102", name: "Boiler Pipe Rack", areaId: areaBoiler.id } });
  const eq3 = await prisma.equipment.create({ data: { tag: "TNK-201", name: "Diesel Storage Tank", areaId: areaTankFarm.id } });
  const eq4 = await prisma.equipment.create({ data: { tag: "TNK-202", name: "Tank Farm Manhole", areaId: areaTankFarm.id } });
  const eq5 = await prisma.equipment.create({ data: { tag: "WS-301", name: "Workshop Crane", areaId: areaWorkshop.id } });
  const eq6 = await prisma.equipment.create({ data: { tag: "WS-302", name: "Workshop Electrical Panel", areaId: areaWorkshop.id } });

  // All dates are relative to the moment the seed runs.
  // If permits look expired, run the seed again.
  const now = new Date();
  const hoursFromNow = (h: number) => new Date(now.getTime() + h * HOUR);

  type Decision = "PENDING" | "APPROVED" | "REJECTED";

  // Creates the two required Approval rows for permits past DRAFT
  async function withApprovals(
    permitId: string,
    decisions: { role: "AREA_OWNER" | "SAFETY_OFFICER"; decision: Decision; approverId?: string; comment?: string }[]
  ) {
    for (const d of decisions) {
      await prisma.approval.create({
        data: {
          permitId,
          requiredRole: d.role,
          decision: d.decision,
          approverId: d.approverId ?? null,
          comment: d.comment ?? null,
          decidedAt: d.decision === "PENDING" ? null : new Date(),
        },
      });
    }
  }

  // One audit log entry, dated "hoursAgo" hours before now
  async function audit(
    permitId: string,
    actorId: string,
    action: string,
    from: PermitStatus | null,
    to: PermitStatus | null,
    hoursAgo: number,
    comment?: string
  ) {
    await prisma.auditLog.create({
      data: {
        permitId,
        actorId,
        action,
        fromStatus: from,
        toStatus: to,
        comment: comment ?? null,
        createdAt: hoursFromNow(-hoursAgo),
      },
    });
  }

  // History helpers, so every seeded permit has a readable timeline
  const created = (id: string, h: number) => audit(id, requester.id, "CREATE", null, "DRAFT", h);
  async function submitted(id: string, h: number) {
    await created(id, h);
    await audit(id, requester.id, "SUBMIT", "DRAFT", "PENDING_APPROVAL", h - 1);
  }
  async function fullyApproved(id: string, h: number) {
    await submitted(id, h);
    await audit(id, areaOwner.id, "APPROVE", "PENDING_APPROVAL", "PENDING_APPROVAL", h - 2, "Area checked, isolation confirmed");
    await audit(id, safetyOfficer.id, "APPROVE", "PENDING_APPROVAL", "APPROVED", h - 3, "Precautions verified on site");
  }

  // 1. DRAFT — Hot Work
  const p1 = await prisma.permit.create({
    data: {
      number: "PTW-0001", type: "HOT_WORK", status: "DRAFT",
      requesterId: requester.id, contractorName: "ABC Welders",
      workDescription: "Weld bracket on pipe rack", areaId: areaBoiler.id, equipmentId: eq2.id,
      plannedStart: hoursFromNow(24), plannedEnd: hoursFromNow(30),
      hazards: ["Fire", "Fumes"], ppeRequired: ["Face shield", "Fire-resistant suit"],
      precautions: [{ text: "Remove combustibles within 10m", done: false }],
      typeData: { hotWorkType: "welding", fireWatchName: "", extinguisherType: "CO2", combustiblesRadius: 10 },
    },
  });
  await created(p1.id, 5);

  // 2. DRAFT — Confined Space
  const p2 = await prisma.permit.create({
    data: {
      number: "PTW-0002", type: "CONFINED_SPACE", status: "DRAFT",
      requesterId: requester.id, contractorName: "XYZ Contractors",
      workDescription: "Inspect tank interior", areaId: areaTankFarm.id, equipmentId: eq3.id,
      plannedStart: hoursFromNow(48), plannedEnd: hoursFromNow(54),
      hazards: ["Low oxygen", "Toxic gas"], ppeRequired: ["SCBA", "Harness"],
      precautions: [{ text: "Continuous ventilation", done: false }],
      typeData: { spaceId: "TNK-201-INT", entryPoint: "Top manhole", standbyAttendant: "", rescuePlan: "", ventilationMethod: "Forced air" },
    },
  });
  await created(p2.id, 4);

  // 3. PENDING_APPROVAL — Working at Height in WORKSHOP.
  // Area owner (Boiler House) is blocked here: use it to demo the wrong-area rule.
  const p3 = await prisma.permit.create({
    data: {
      number: "PTW-0003", type: "WORKING_AT_HEIGHT", status: "PENDING_APPROVAL",
      requesterId: requester.id, contractorName: "SkyWork Contractors",
      workDescription: "Repair crane rail at height", areaId: areaWorkshop.id, equipmentId: eq5.id,
      plannedStart: hoursFromNow(12), plannedEnd: hoursFromNow(16),
      hazards: ["Fall"], ppeRequired: ["Full body harness", "Helmet"],
      precautions: [{ text: "Barricade area below", done: true }],
      typeData: { heightMeters: 6, accessMethod: "scaffold", fallArrestEquipment: "Double lanyard", anchorPointChecked: true, barricadingBelow: true },
    },
  });
  await withApprovals(p3.id, [
    { role: "AREA_OWNER", decision: "PENDING" },
    { role: "SAFETY_OFFICER", decision: "PENDING" },
  ]);
  await submitted(p3.id, 10);

  // 4. PENDING_APPROVAL — Electrical LOTO in BOILER HOUSE.
  // Area owner (Boiler House) can approve this one.
  const p4 = await prisma.permit.create({
    data: {
      number: "PTW-0004", type: "ELECTRICAL_LOTO", status: "PENDING_APPROVAL",
      requesterId: requester.id, contractorName: "PowerSafe Electricians",
      workDescription: "Isolate and replace breaker for feed pump motor", areaId: areaBoiler.id, equipmentId: eq1.id,
      plannedStart: hoursFromNow(6), plannedEnd: hoursFromNow(10),
      hazards: ["Electric shock"], ppeRequired: ["Insulated gloves", "Arc flash suit"],
      precautions: [{ text: "Test dead before touching", done: false }],
      typeData: { equipmentTag: "BLR-101", voltageLevel: "415V", isolationPoints: ["MCB-12"], lockNumbers: ["LK-045"], tagNumbers: ["TG-045"], earthingApplied: true, testedDeadBy: "" },
    },
  });
  await withApprovals(p4.id, [
    { role: "AREA_OWNER", decision: "PENDING" },
    { role: "SAFETY_OFFICER", decision: "PENDING" },
  ]);
  await submitted(p4.id, 8);

  // 5. APPROVED — Hot Work, start time already passed, so it CAN be activated now
  const p5 = await prisma.permit.create({
    data: {
      number: "PTW-0005", type: "HOT_WORK", status: "APPROVED",
      requesterId: requester.id, contractorName: "ABC Welders",
      workDescription: "Cut damaged pipe section", areaId: areaBoiler.id, equipmentId: eq1.id,
      plannedStart: hoursFromNow(-0.5), plannedEnd: hoursFromNow(5),
      hazards: ["Fire", "Sparks"], ppeRequired: ["Face shield", "Gloves"],
      precautions: [{ text: "Fire watch present", done: true }],
      typeData: { hotWorkType: "cutting", fireWatchName: "Ganesh", extinguisherType: "DCP", combustiblesRadius: 10, gasTest: { lel: 0, o2: 20.9, testedAt: now.toISOString() } },
    },
  });
  await withApprovals(p5.id, [
    { role: "AREA_OWNER", decision: "APPROVED", approverId: areaOwner.id, comment: "Area checked, isolation confirmed" },
    { role: "SAFETY_OFFICER", decision: "APPROVED", approverId: safetyOfficer.id, comment: "Precautions verified on site" },
  ]);
  await fullyApproved(p5.id, 30);

  // 6. APPROVED — Confined Space, starts in 2 hours, so activating it now must be REFUSED
  const p6 = await prisma.permit.create({
    data: {
      number: "PTW-0006", type: "CONFINED_SPACE", status: "APPROVED",
      requesterId: requester.id, contractorName: "XYZ Contractors",
      workDescription: "Clean tank sediment", areaId: areaTankFarm.id, equipmentId: eq4.id,
      plannedStart: hoursFromNow(2), plannedEnd: hoursFromNow(8),
      hazards: ["Low oxygen"], ppeRequired: ["SCBA"],
      precautions: [{ text: "Standby attendant present", done: true }],
      typeData: { spaceId: "TNK-202", entryPoint: "Side manhole", standbyAttendant: "Mani", rescuePlan: "Tripod winch", ventilationMethod: "Forced air", atmosphericTest: { o2: 20.9, lel: 0, h2s: 0, co: 0, testedAt: now.toISOString() } },
    },
  });
  await withApprovals(p6.id, [
    { role: "AREA_OWNER", decision: "APPROVED", approverId: areaOwner.id, comment: "Area checked, isolation confirmed" },
    { role: "SAFETY_OFFICER", decision: "APPROVED", approverId: safetyOfficer.id, comment: "Precautions verified on site" },
  ]);
  await fullyApproved(p6.id, 26);

  // 7. ACTIVE — expires in 1.5 hours (shows in "expiring within 2 hours" on the dashboard)
  const p7 = await prisma.permit.create({
    data: {
      number: "PTW-0007", type: "WORKING_AT_HEIGHT", status: "ACTIVE",
      requesterId: requester.id, contractorName: "SkyWork Contractors",
      workDescription: "Paint external wall", areaId: areaWorkshop.id, equipmentId: eq5.id,
      plannedStart: hoursFromNow(-2), plannedEnd: hoursFromNow(1.5),
      hazards: ["Fall"], ppeRequired: ["Harness"],
      precautions: [{ text: "Anchor point checked", done: true }],
      typeData: { heightMeters: 4, accessMethod: "ladder", fallArrestEquipment: "Single lanyard", anchorPointChecked: true, barricadingBelow: true },
    },
  });
  await withApprovals(p7.id, [
    { role: "AREA_OWNER", decision: "APPROVED", approverId: areaOwner.id, comment: "Area checked, isolation confirmed" },
    { role: "SAFETY_OFFICER", decision: "APPROVED", approverId: safetyOfficer.id, comment: "Precautions verified on site" },
  ]);
  await fullyApproved(p7.id, 28);
  await audit(p7.id, requester.id, "ACTIVATE", "APPROVED", "ACTIVE", 2);

  // 8. ACTIVE — long window, good one to suspend in the demo
  const p8 = await prisma.permit.create({
    data: {
      number: "PTW-0008", type: "ELECTRICAL_LOTO", status: "ACTIVE",
      requesterId: requester.id, contractorName: "PowerSafe Electricians",
      workDescription: "Rewire control panel", areaId: areaWorkshop.id, equipmentId: eq6.id,
      plannedStart: hoursFromNow(-1), plannedEnd: hoursFromNow(6),
      hazards: ["Electric shock"], ppeRequired: ["Insulated gloves"],
      precautions: [{ text: "Locked out and tagged", done: true }],
      typeData: { equipmentTag: "WS-302", voltageLevel: "230V", isolationPoints: ["MCB-08"], lockNumbers: ["LK-051"], tagNumbers: ["TG-051"], earthingApplied: true, testedDeadBy: "Suresh Iyer" },
    },
  });
  await withApprovals(p8.id, [
    { role: "AREA_OWNER", decision: "APPROVED", approverId: areaOwner.id, comment: "Area checked, isolation confirmed" },
    { role: "SAFETY_OFFICER", decision: "APPROVED", approverId: safetyOfficer.id, comment: "Precautions verified on site" },
  ]);
  await fullyApproved(p8.id, 27);
  await audit(p8.id, requester.id, "ACTIVATE", "APPROVED", "ACTIVE", 1);

  // 9. CLOSED — work done, waiting for the safety officer to verify
  const p9 = await prisma.permit.create({
    data: {
      number: "PTW-0009", type: "HOT_WORK", status: "CLOSED",
      requesterId: requester.id, contractorName: "ABC Welders",
      workDescription: "Grind weld seam smooth", areaId: areaBoiler.id, equipmentId: eq2.id,
      plannedStart: hoursFromNow(-30), plannedEnd: hoursFromNow(-24),
      hazards: ["Sparks"], ppeRequired: ["Face shield"],
      precautions: [{ text: "Fire watch present", done: true }],
      completionNotes: "Work completed, area inspected by requester",
      typeData: { hotWorkType: "grinding", fireWatchName: "Ganesh", extinguisherType: "CO2", combustiblesRadius: 10 },
    },
  });
  await withApprovals(p9.id, [
    { role: "AREA_OWNER", decision: "APPROVED", approverId: areaOwner.id, comment: "Area checked, isolation confirmed" },
    { role: "SAFETY_OFFICER", decision: "APPROVED", approverId: safetyOfficer.id, comment: "Precautions verified on site" },
  ]);
  await fullyApproved(p9.id, 60);
  await audit(p9.id, requester.id, "ACTIVATE", "APPROVED", "ACTIVE", 30);
  await audit(p9.id, requester.id, "CLOSE", "ACTIVE", "CLOSED", 24, "Work completed, area inspected by requester");

  // 10. REJECTED — with the reason saved
  const p10 = await prisma.permit.create({
    data: {
      number: "PTW-0010", type: "CONFINED_SPACE", status: "REJECTED",
      requesterId: requester.id, contractorName: "XYZ Contractors",
      workDescription: "Enter tank without ventilation plan", areaId: areaTankFarm.id, equipmentId: eq3.id,
      plannedStart: hoursFromNow(20), plannedEnd: hoursFromNow(26),
      hazards: ["Low oxygen"], ppeRequired: ["SCBA"],
      precautions: [],
      typeData: { spaceId: "TNK-201-INT", entryPoint: "Top manhole", standbyAttendant: "", rescuePlan: "", ventilationMethod: "" },
    },
  });
  await withApprovals(p10.id, [
    { role: "AREA_OWNER", decision: "REJECTED", approverId: areaOwner.id, comment: "No rescue plan provided" },
    { role: "SAFETY_OFFICER", decision: "PENDING" },
  ]);
  await submitted(p10.id, 30);
  await audit(p10.id, areaOwner.id, "REJECT", "PENDING_APPROVAL", "REJECTED", 28, "No rescue plan provided");

  console.log("\nSeed complete. Login with any of these (password: " + PASSWORD + "):");
  console.log("REQUESTER:       requester@ptw.test");
  console.log("AREA_OWNER:      areaowner@ptw.test  (owns: Boiler House)");
  console.log("SAFETY_OFFICER:  safety@ptw.test");
  console.log("ADMIN:           admin@ptw.test");
  console.log("\nDates are relative to now. Re-run the seed if permits look expired.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());