import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiRequestError } from "../api";
import type { PermitType } from "../types";

const TYPE_OPTIONS: { value: PermitType; label: string }[] = [
  { value: "HOT_WORK", label: "Hot work" },
  { value: "CONFINED_SPACE", label: "Confined space entry" },
  { value: "WORKING_AT_HEIGHT", label: "Working at height" },
  { value: "ELECTRICAL_LOTO", label: "Electrical / isolation (LOTO)" },
];

// NOTE: areaId/equipmentId below are typed as free text for simplicity —
// wire these to real dropdowns fetched from /areas and /equipment if you add those endpoints.
export default function CreatePermit() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [type, setType] = useState<PermitType>("HOT_WORK");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    contractorName: "",
    workDescription: "",
    areaId: "",
    equipmentId: "",
    plannedStart: "",
    plannedEnd: "",
    hazards: "",
    ppeRequired: "",
  });

  const [typeData, setTypeData] = useState<Record<string, string>>({});

  function updateField<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCreate(thenSubmit: boolean) {
  setError(null);
    setSubmitting(true);
    try {
      const body = {
        type,
        contractorName: form.contractorName,
        workDescription: form.workDescription,
        areaId: form.areaId,
        equipmentId: form.equipmentId,
        plannedStart: new Date(form.plannedStart).toISOString(),
        plannedEnd: new Date(form.plannedEnd).toISOString(),
        hazards: form.hazards.split(",").map((s) => s.trim()).filter(Boolean),
        ppeRequired: form.ppeRequired.split(",").map((s) => s.trim()).filter(Boolean),
        typeData: buildTypeData(type, typeData),
      };
     const permit = await api.post<{ id: string; conflictWarning?: string | null }>("/permits", body);
if (permit.conflictWarning) {
  alert(`⚠ ${permit.conflictWarning}`);
}
if (thenSubmit) {
  await api.post(`/permits/${permit.id}/submit`);
}
navigate(`/permits/${permit.id}`);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.issues ? err.issues.map((i) => `${i.path}: ${i.message}`).join("; ") : err.message);
      } else {
        setError("Something went wrong");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="topbar topbar-dark">
        <div className="topbar-brand" style={{ cursor: "pointer" }} onClick={() => navigate("/dashboard")}>
          ← Permits
        </div>
      </div>

      <div className="page" style={{ maxWidth: 640 }}>
        <h2 style={{ fontSize: 21, marginBottom: 4 }}>New permit</h2>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 20 }}>Step {step} of 2</p>

        {error && <div className="card" style={{ borderColor: "var(--danger)", marginBottom: 16 }}><p className="error-text" style={{ fontSize: 13 }}>{error}</p></div>}

        {step === 1 && (
          <div className="card">
            <div className="field">
              <label>Permit type</label>
              <select value={type} onChange={(e) => setType(e.target.value as PermitType)}>
                {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Contractor / team</label>
              <input value={form.contractorName} onChange={(e) => updateField("contractorName", e.target.value)} required />
            </div>
            <div className="field">
              <label>Work description</label>
              <textarea rows={3} value={form.workDescription} onChange={(e) => updateField("workDescription", e.target.value)} required
                style={{ width: "100%", padding: 9, border: "1px solid var(--border)", borderRadius: "var(--radius)" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field">
                <label>Area ID</label>
                <input value={form.areaId} onChange={(e) => updateField("areaId", e.target.value)} placeholder="paste from Studio" required />
              </div>
              <div className="field">
                <label>Equipment ID</label>
                <input value={form.equipmentId} onChange={(e) => updateField("equipmentId", e.target.value)} placeholder="paste from Studio" required />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field">
                <label>Planned start</label>
                <input type="datetime-local" value={form.plannedStart} onChange={(e) => updateField("plannedStart", e.target.value)} required />
              </div>
              <div className="field">
                <label>Planned end</label>
                <input type="datetime-local" value={form.plannedEnd} onChange={(e) => updateField("plannedEnd", e.target.value)} required />
              </div>
            </div>
            <div className="field">
              <label>Hazards (comma-separated)</label>
              <input value={form.hazards} onChange={(e) => updateField("hazards", e.target.value)} placeholder="Fire, Fumes" />
            </div>
            <div className="field">
              <label>PPE required (comma-separated)</label>
              <input value={form.ppeRequired} onChange={(e) => updateField("ppeRequired", e.target.value)} placeholder="Face shield, Gloves" />
            </div>
            <button className="btn btn-primary" onClick={() => setStep(2)}>Continue</button>
          </div>
        )}

        {step === 2 && (
          <form className="card">
            <TypeFields type={type} values={typeData} onChange={(k, v) => setTypeData((d) => ({ ...d, [k]: v }))} />
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button type="button" className="btn" onClick={() => setStep(1)}>Back</button>
<button type="button" className="btn" disabled={submitting} onClick={() => handleCreate(false)}>
  Save as draft
</button>
<button type="button" className="btn btn-primary" disabled={submitting} onClick={() => handleCreate(true)}>
  Submit for approval
</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function TypeFields({
  type,
  values,
  onChange,
}: {
  type: PermitType;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const v = (k: string) => values[k] ?? "";
  const field = (key: string, label: string, placeholder = "") => (
    <div className="field" key={key}>
      <label>{label}</label>
      <input value={v(key)} onChange={(e) => onChange(key, e.target.value)} placeholder={placeholder} />
    </div>
  );

  if (type === "HOT_WORK") {
    return (
      <>
        {field("hotWorkType", "Type of hot work", "welding / grinding / cutting / soldering")}
        {field("fireWatchName", "Fire watch assigned")}
        {field("extinguisherType", "Fire extinguisher type")}
        {field("combustiblesRadius", "Combustibles cleared radius (m)")}
        {field("gasTestLel", "Gas test — LEL %")}
        {field("gasTestO2", "Gas test — O2 %")}
      </>
    );
  }
  if (type === "CONFINED_SPACE") {
    return (
      <>
        {field("spaceId", "Space ID")}
        {field("entryPoint", "Entry point")}
        {field("standbyAttendant", "Standby attendant")}
        {field("rescuePlan", "Rescue plan")}
        {field("ventilationMethod", "Ventilation method")}
        {field("atmosphericO2", "Atmospheric test — O2 %")}
        {field("atmosphericLel", "Atmospheric test — LEL %")}
        {field("atmosphericH2s", "Atmospheric test — H2S ppm")}
        {field("atmosphericCo", "Atmospheric test — CO ppm")}
      </>
    );
  }
  if (type === "WORKING_AT_HEIGHT") {
    return (
      <>
        {field("heightMeters", "Height (metres)")}
        {field("accessMethod", "Access method", "scaffold / ladder / MEWP / rope")}
        {field("fallArrestEquipment", "Fall arrest equipment")}
        {field("anchorPointChecked", "Anchor point checked (true/false)")}
        {field("barricadingBelow", "Barricading below (true/false)")}
      </>
    );
  }
  return (
    <>
      {field("equipmentTag", "Equipment tag")}
      {field("voltageLevel", "Voltage level")}
      {field("isolationPoints", "Isolation points (comma-separated)")}
      {field("lockNumbers", "Lock numbers (comma-separated)")}
      {field("tagNumbers", "Tag numbers (comma-separated)")}
      {field("testedDeadBy", "Tested dead by")}
    </>
  );
}

function buildTypeData(type: PermitType, raw: Record<string, string>): Record<string, unknown> {
  const num = (k: string) => (raw[k] ? Number(raw[k]) : 0);
  const bool = (k: string) => raw[k]?.toLowerCase() === "true";
  const list = (k: string) => (raw[k] ? raw[k].split(",").map((s) => s.trim()).filter(Boolean) : []);
  const now = new Date().toISOString();

  if (type === "HOT_WORK") {
    return {
      hotWorkType: raw.hotWorkType || "welding",
      fireWatchName: raw.fireWatchName || "",
      extinguisherType: raw.extinguisherType || "",
      combustiblesRadius: num("combustiblesRadius"),
      gasTest: { lel: num("gasTestLel"), o2: num("gasTestO2"), testedAt: now },
    };
  }
  if (type === "CONFINED_SPACE") {
    return {
      spaceId: raw.spaceId || "",
      entryPoint: raw.entryPoint || "",
      standbyAttendant: raw.standbyAttendant || "",
      rescuePlan: raw.rescuePlan || "",
      ventilationMethod: raw.ventilationMethod || "",
      atmosphericTest: {
        o2: num("atmosphericO2"), lel: num("atmosphericLel"),
        h2s: num("atmosphericH2s"), co: num("atmosphericCo"), testedAt: now,
      },
    };
  }
  if (type === "WORKING_AT_HEIGHT") {
    return {
      heightMeters: num("heightMeters"),
      accessMethod: raw.accessMethod || "ladder",
      fallArrestEquipment: raw.fallArrestEquipment || "",
      anchorPointChecked: bool("anchorPointChecked"),
      barricadingBelow: bool("barricadingBelow"),
    };
  }
  return {
    equipmentTag: raw.equipmentTag || "",
    voltageLevel: raw.voltageLevel || "",
    isolationPoints: list("isolationPoints"),
    lockNumbers: list("lockNumbers"),
    tagNumbers: list("tagNumbers"),
    earthingApplied: true,
    testedDeadBy: raw.testedDeadBy || "",
  };
}