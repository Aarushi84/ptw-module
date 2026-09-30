import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, ApiRequestError } from "../api";
import type { Permit, PermitStatus, PermitType } from "../types";

const STATUS_LABEL: Record<PermitStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  CLOSED: "Closed",
  CLOSED_VERIFIED: "Verified",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

const STATUS_BADGE: Record<PermitStatus, string> = {
  DRAFT: "badge-draft",
  PENDING_APPROVAL: "badge-pending",
  APPROVED: "badge-approved",
  ACTIVE: "badge-active",
  SUSPENDED: "badge-suspended",
  CLOSED: "badge-closed",
  CLOSED_VERIFIED: "badge-closed",
  REJECTED: "badge-rejected",
  EXPIRED: "badge-expired",
  CANCELLED: "badge-cancelled",
};

const TYPE_LABEL: Record<PermitType, string> = {
  HOT_WORK: "Hot work",
  CONFINED_SPACE: "Confined space",
  WORKING_AT_HEIGHT: "Working at height",
  ELECTRICAL_LOTO: "Electrical / LOTO",
};

interface AreaOption {
  id: string;
  name: string;
  plant: { name: string };
}

function StatusBadge({ status }: { status: PermitStatus }) {
  return (
    <span className={`badge ${STATUS_BADGE[status]}`}>
      <span className="dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hoursUntil(iso: string) {
  return (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60);
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [permits, setPermits] = useState<Permit[]>([]);
  const [activePermits, setActivePermits] = useState<Permit[]>([]);
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [myApprovalsOnly, setMyApprovalsOnly] = useState(false);
  const [search, setSearch] = useState("");

  // Area list for the filter
  useEffect(() => {
    api.get<AreaOption[]>("/lookup/areas").then(setAreas).catch(() => {});
  }, []);

  // The two top cards always use ALL active permits, whatever the filters say.
  // Refreshed every minute, so an expired permit drops off by itself.
  useEffect(() => {
    let cancelled = false;
    async function loadActive() {
      try {
        const data = await api.get<Permit[]>("/permits?status=ACTIVE");
        if (!cancelled) setActivePermits(data);
      } catch {
        // keep the last values
      }
    }
    loadActive();
    const timer = setInterval(loadActive, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // The table uses the filters
  useEffect(() => {
    let cancelled = false;

    async function loadPermits() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (statusFilter) params.set("status", statusFilter);
        if (typeFilter) params.set("type", typeFilter);
        if (areaFilter) params.set("areaId", areaFilter);
        if (fromDate) params.set("from", new Date(`${fromDate}T00:00:00`).toISOString());
        if (toDate) params.set("to", new Date(`${toDate}T23:59:59`).toISOString());
        if (myApprovalsOnly) params.set("mine", "pendingApproval");
        const data = await api.get<Permit[]>(`/permits?${params.toString()}`);
        if (!cancelled) setPermits(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : "Could not load permits");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPermits();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, typeFilter, areaFilter, fromDate, toDate, myApprovalsOnly]);

  const activeNow = activePermits;
  const expiringSoon = useMemo(
    () => activePermits.filter((p) => hoursUntil(p.plannedEnd) <= 2 && hoursUntil(p.plannedEnd) >= 0),
    [activePermits]
  );

  const visiblePermits = useMemo(() => {
    if (!search.trim()) return permits;
    const q = search.toLowerCase();
    return permits.filter(
      (p) =>
        p.number.toLowerCase().includes(q) ||
        p.workDescription.toLowerCase().includes(q) ||
        p.contractorName.toLowerCase().includes(q)
    );
  }, [permits, search]);

  const anyFilter = statusFilter || typeFilter || areaFilter || fromDate || toDate || myApprovalsOnly || search;

  function clearFilters() {
    setStatusFilter("");
    setTypeFilter("");
    setAreaFilter("");
    setFromDate("");
    setToDate("");
    setMyApprovalsOnly(false);
    setSearch("");
  }

  return (
    <div>
      <div className="topbar topbar-dark">
        <div className="topbar-brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2 3 6v6c0 5 3.8 8.7 9 10 5.2-1.3 9-5 9-10V6l-9-4Z"
              fill="rgba(255,255,255,0.12)"
              stroke="#fff"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M8.5 12.2 11 14.7l4.5-5"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Permit to Work
        </div>
        <div className="topbar-user">
          <span>
            {user?.name} <span className="muted">· {user?.role.replace("_", " ")}</span>
          </span>
          <button className="btn btn-sm" onClick={logout}>
            Log out
          </button>
        </div>
      </div>

      <div className="page">
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 4, height: 40, background: "var(--accent)", borderRadius: 2, marginTop: 2 }} />
            <div>
              <h2 style={{ fontSize: 21, marginBottom: 4 }}>Permits</h2>
              <p className="muted" style={{ fontSize: 13.5 }}>
                {visiblePermits.length} permit{visiblePermits.length !== 1 ? "s" : ""} in view
              </p>
            </div>
          </div>
          {(user?.role === "REQUESTER" || user?.role === "ADMIN") && (
            <button className="btn btn-primary" onClick={() => navigate("/permits/new")}>
              + New permit
            </button>
          )}
        </div>

        {/* Highlight row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div
            className="card"
            style={{
              borderColor: activeNow.length ? "var(--success)" : "var(--border)",
              background: activeNow.length
                ? "linear-gradient(135deg, #eef4ff 0%, var(--surface) 60%)"
                : "var(--surface)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  Active right now
                </div>
                <div style={{ fontSize: 26, fontWeight: 700 }}>{activeNow.length}</div>
              </div>
              <div className="badge badge-active">
                <span className="dot" />
                Live
              </div>
            </div>
          </div>

          <div
            className="card"
            style={{
              borderColor: expiringSoon.length ? "var(--warn)" : "var(--border)",
              background: expiringSoon.length
                ? "linear-gradient(135deg, #fff8ec 0%, var(--surface) 60%)"
                : "var(--surface)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  Expiring within 2 hours
                </div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    color: expiringSoon.length ? "var(--warn)" : "var(--text)",
                  }}
                >
                  {expiringSoon.length}
                </div>
              </div>
              {expiringSoon.length > 0 && (
                <div className="badge badge-pending">
                  <span className="dot" />
                  Attention
                </div>
              )}
            </div>
            {expiringSoon.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {expiringSoon.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/permits/${p.id}`)}
                    style={{ fontSize: 12.5, cursor: "pointer", display: "flex", justifyContent: "space-between" }}
                  >
                    <span className="mono">{p.number}</span>
                    <span className="muted">ends {formatDateTime(p.plannedEnd)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <input
            placeholder="Search number, contractor, description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: "1 1 220px",
              padding: "8px 11px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: 13.5,
            }}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
            <option value="">All types</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} style={selectStyle}>
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.plant.name} → {a.name}
              </option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
            From
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={selectStyle} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
            To
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={selectStyle} />
          </label>
          {(user?.role === "AREA_OWNER" || user?.role === "SAFETY_OFFICER" || user?.role === "ADMIN") && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
              <input
                type="checkbox"
                checked={myApprovalsOnly}
                onChange={(e) => setMyApprovalsOnly(e.target.checked)}
              />
              My approvals pending
            </label>
          )}
          {anyFilter && (
            <button className="btn btn-sm" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {loading ? (
            <div className="empty-state">Loading permits…</div>
          ) : error ? (
            <div className="empty-state error-text">{error}</div>
          ) : visiblePermits.length === 0 ? (
            <div className="empty-state">No permits match these filters.</div>
          ) : (
            <table>
              <thead style={{ background: "var(--accent-dim)" }}>
                <tr>
                  <th>Permit</th>
                  <th>Type</th>
                  <th>Area / Equipment</th>
                  <th>Contractor</th>
                  <th>Window</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visiblePermits.map((p) => (
                  <tr key={p.id} onClick={() => navigate(`/permits/${p.id}`)}>
                    <td className="mono" style={{ color: "var(--accent)", fontWeight: 600 }}>
                      {p.number}
                    </td>
                    <td>{TYPE_LABEL[p.type]}</td>
                    <td>
                      {p.area?.name ?? "—"}
                      <div className="muted mono" style={{ fontSize: 11.5 }}>
                        {p.equipment?.tag}
                      </div>
                    </td>
                    <td>{p.contractorName}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {formatDateTime(p.plannedStart)} → {formatDateTime(p.plannedEnd)}
                    </td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const selectStyle: CSSProperties = {
  padding: "8px 11px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  fontSize: 13.5,
  background: "var(--surface)",
  color: "var(--text)",
};