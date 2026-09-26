import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "password123";

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
  const admin = await prisma.user.create({
    data: { name: "Admin User", email: "admin@ptw.test", passwordHash: hash, role: "ADMIN" },
  });

  // Equipment (~6, spread across areas)
  const eq1 = await prisma.equipment.create({ data: { tag: "BLR-101", name: "Boiler Feed Pump", areaId: areaBoiler.id } });
  const eq2 = await prisma.equipment.create({ data: { tag: "BLR-102", name: "Boiler Pipe Rack", areaId: areaBoiler.id } });
  const eq3 = await prisma.equipment.create({ data: { tag: "TNK-201", name: "Diesel Storage Tank", areaId: areaTankFarm.id } });
  const eq4 = await prisma.equipment.create({ data: { tag: "TNK-202", name: "Tank Farm Manhole", areaId: areaTankFarm.id } });
  const eq5 = await prisma.equipment.create({ data: { tag: "WS-301", name: "Workshop Crane", areaId: areaWorkshop.id } });
  const eq6 = await prisma.equipment.create({ data: { tag: "WS-302", name: "Workshop Electrical Panel", areaId: areaWorkshop.id } });

  const now = new Date();
  const hoursFromNow = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);

  // Helper to create the two required Approval rows for permits past DRAFT
  async function withApprovals(permitId: string, decisions: { role: "AREA_OWNER" | "SAFETY_OFFICER"; decision: "PENDING" | "APPROVED" | "REJECTED"; approverId?: string }[]) {
    for (const d of decisions) {
      await prisma.approval.create({
        data: {
          permitId,
          requiredRole: d.role,
          decision: d.decision,
          approverId: d.approverId ?? null,
          decidedAt: d.decision === "PENDING" ? null : new Date(),
        },
      });
    }
  }

  // 1. DRAFT — Hot Work
  await prisma.permit.create({
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

  // 2. DRAFT — Confined Space
  await prisma.permit.create({
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

  // 3 & 4. PENDING_APPROVAL — one Working at Height, one Electrical LOTO, both with pending Approval rows
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

  const p4 = await prisma.permit.create({
    data: {
      number: "PTW-0004", type: "ELECTRICAL_LOTO", status: "PENDING_APPROVAL",
      requesterId: requester.id, contractorName: "PowerSafe Electricians",
      workDescription: "Replace breaker in panel", areaId: areaWorkshop.id, equipmentId: eq6.id,
      plannedStart: hoursFromNow(6), plannedEnd: hoursFromNow(10),
      hazards: ["Electric shock"], ppeRequired: ["Insulated gloves", "Arc flash suit"],
      precautions: [{ text: "Test dead before touching", done: false }],
      typeData: { equipmentTag: "WS-302", voltageLevel: "415V", isolationPoints: ["MCB-12"], lockNumbers: ["LK-045"], tagNumbers: ["TG-045"], earthingApplied: true, testedDeadBy: "" },
    },
  });
  await withApprovals(p4.id, [
    { role: "AREA_OWNER", decision: "APPROVED", approverId: areaOwner.id },
    { role: "SAFETY_OFFICER", decision: "PENDING" },
  ]);

  // 5 & 6. APPROVED — fully approved, ready to activate
  const p5 = await prisma.permit.create({
    data: {
      number: "PTW-0005", type: "HOT_WORK", status: "APPROVED",
      requesterId: requester.id, contractorName: "ABC Welders",
      workDescription: "Cut damaged pipe section", areaId: areaBoiler.id, equipmentId: eq1.id,
      plannedStart: hoursFromNow(1), plannedEnd: hoursFromNow(5),
      hazards: ["Fire", "Sparks"], ppeRequired: ["Face shield", "Gloves"],
      precautions: [{ text: "Fire watch present", done: true }],
      typeData: { hotWorkType: "cutting", fireWatchName: "Ganesh", extinguisherType: "DCP", combustiblesRadius: 10, gasTest: { lel: 0, o2: 20.9, testedAt: now.toISOString() } },
    },
  });
  await withApprovals(p5.id, [
    { role: "AREA_OWNER", decision: "APPROVED", approverId: areaOwner.id },
    { role: "SAFETY_OFFICER", decision: "APPROVED", approverId: safetyOfficer.id },
  ]);

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
    { role: "AREA_OWNER", decision: "APPROVED", approverId: areaOwner.id },
    { role: "SAFETY_OFFICER", decision: "APPROVED", approverId: safetyOfficer.id },
  ]);

  // 7 & 8. ACTIVE — currently in progress, one expiring soon (within 2 hrs) to test the dashboard highlight
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
    { role: "AREA_OWNER", decision: "APPROVED", approverId: areaOwner.id },
    { role: "SAFETY_OFFICER", decision: "APPROVED", approverId: safetyOfficer.id },
  ]);

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
    { role: "AREA_OWNER", decision: "APPROVED", approverId: areaOwner.id },
    { role: "SAFETY_OFFICER", decision: "APPROVED", approverId: safetyOfficer.id },
  ]);

  // 9. CLOSED — awaiting safety officer verification
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
    { role: "AREA_OWNER", decision: "APPROVED", approverId: areaOwner.id },
    { role: "SAFETY_OFFICER", decision: "APPROVED", approverId: safetyOfficer.id },
  ]);

  // 10. REJECTED
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
    { role: "AREA_OWNER", decision: "REJECTED", approverId: areaOwner.id, comment: "No rescue plan provided" } as any,
    { role: "SAFETY_OFFICER", decision: "PENDING" },
  ]);

  console.log("\nSeed complete. Login with any of these (password: " + PASSWORD + "):");
  console.log("REQUESTER:       requester@ptw.test");
  console.log("AREA_OWNER:      areaowner@ptw.test  (owns: Boiler House)");
  console.log("SAFETY_OFFICER:  safety@ptw.test");
  console.log("ADMIN:           admin@ptw.test");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());