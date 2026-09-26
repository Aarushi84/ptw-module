import { z } from "zod";
import type { PermitType } from "@prisma/client";

const gasTestSchema = z.object({
  lel: z.number().min(0).max(100),
  o2: z.number().min(0).max(100),
  testedAt: z.string(),
});

const hotWorkSchema = z.object({
  hotWorkType: z.enum(["welding", "grinding", "cutting", "soldering"]),
  fireWatchName: z.string().min(1, "Fire watch name is required"),
  extinguisherType: z.string().min(1, "Extinguisher type is required"),
  combustiblesRadius: z.number().min(0),
  gasTest: gasTestSchema,
});

const confinedSpaceSchema = z.object({
  spaceId: z.string().min(1),
  entryPoint: z.string().min(1),
  atmosphericTest: z.object({
    o2: z.number().min(0).max(100),
    lel: z.number().min(0).max(100),
    h2s: z.number().min(0),
    co: z.number().min(0),
    testedAt: z.string(),
  }),
  standbyAttendant: z.string().min(1, "Standby attendant name is required"),
  rescuePlan: z.string().min(1, "Rescue plan is required"),
  ventilationMethod: z.string().min(1),
});

const workingAtHeightSchema = z.object({
  heightMeters: z.number().positive(),
  accessMethod: z.enum(["scaffold", "ladder", "MEWP", "rope"]),
  fallArrestEquipment: z.string().min(1),
  anchorPointChecked: z.boolean(),
  barricadingBelow: z.boolean(),
});

const electricalLotoSchema = z.object({
  equipmentTag: z.string().min(1),
  voltageLevel: z.string().min(1),
  isolationPoints: z.array(z.string()).min(1, "At least one isolation point is required"),
  lockNumbers: z.array(z.string()).min(1, "At least one lock number is required"),
  tagNumbers: z.array(z.string()).min(1, "At least one tag number is required"),
  earthingApplied: z.boolean(),
  testedDeadBy: z.string().min(1, "Must record who tested the circuit dead"),
});

const SCHEMAS: Record<PermitType, z.ZodTypeAny> = {
  HOT_WORK: hotWorkSchema,
  CONFINED_SPACE: confinedSpaceSchema,
  WORKING_AT_HEIGHT: workingAtHeightSchema,
  ELECTRICAL_LOTO: electricalLotoSchema,
};

export class ValidationError extends Error {
  constructor(public issues: { path: string; message: string }[]) {
    super("Validation failed");
  }
}

/** Validates typeData against the schema for the given permit type. Returns cleaned data or throws ValidationError. */
export function validateTypeData(type: PermitType, data: unknown) {
  const schema = SCHEMAS[type];
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    throw new ValidationError(issues);
  }
  return result.data;
}