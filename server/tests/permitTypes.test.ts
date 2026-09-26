import { describe, it, expect } from "vitest";
import { validateTypeData, ValidationError } from "../src/validation/permitTypes";

describe("per-type validation", () => {
  it("accepts valid hot work data", () => {
    const data = {
      hotWorkType: "welding", fireWatchName: "Ganesh", extinguisherType: "CO2",
      combustiblesRadius: 10, gasTest: { lel: 0, o2: 20.9, testedAt: new Date().toISOString() },
    };
    expect(() => validateTypeData("HOT_WORK", data)).not.toThrow();
  });

  it("rejects hot work missing fire watch", () => {
    const data = {
      hotWorkType: "welding", fireWatchName: "", extinguisherType: "CO2",
      combustiblesRadius: 10, gasTest: { lel: 0, o2: 20.9, testedAt: new Date().toISOString() },
    };
    expect(() => validateTypeData("HOT_WORK", data)).toThrow(ValidationError);
  });

  it("rejects electrical LOTO with no isolation points", () => {
    const data = {
      equipmentTag: "WS-302", voltageLevel: "415V", isolationPoints: [],
      lockNumbers: ["LK-1"], tagNumbers: ["TG-1"], earthingApplied: true, testedDeadBy: "Suresh",
    };
    expect(() => validateTypeData("ELECTRICAL_LOTO", data)).toThrow(ValidationError);
  });

  it("rejects confined space with an out-of-range O2 reading", () => {
    const data = {
      spaceId: "TNK-1", entryPoint: "Top", standbyAttendant: "Mani", rescuePlan: "Winch",
      ventilationMethod: "Forced air",
      atmosphericTest: { o2: 150, lel: 0, h2s: 0, co: 0, testedAt: new Date().toISOString() },
    };
    expect(() => validateTypeData("CONFINED_SPACE", data)).toThrow(ValidationError);
  });
});