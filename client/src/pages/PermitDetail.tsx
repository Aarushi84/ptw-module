import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, ApiRequestError } from "../api";
import type { Permit, PermitStatus } from "../types";
import { getAvailableActions } from "../lib/permitActions";

const STATUS_LABEL: Record<PermitStatus, string> = {
  DRAFT: "Draft", PENDING_APPROVAL: "Pending approval", APPROVED: "Approved",
  ACTIVE: "Active", SUSPENDED: "Suspended", CLOSED: "Closed",
  CLOSED_VERIFIED: "Verified", REJECTED: "Rejected", EXPIRED: "Expired", CANCELLED: "Cancelled",
};
const STATUS_BADGE: Record<PermitStatus, string> = {
  DRAFT: "badge-draft", PENDING_APPROVAL: "badge-pending", APPROVED: "badge-approved",
  ACTIVE: "badge-active", SUSPENDED: "badge-suspended", CLOSED: "badge-closed",
  CLOSED_VERIFIED: "badge-closed", REJECTED: "badge-rejected", EXPIRED: "badge-expired", CANCELLED: "badge-cancelled",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function PermitDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [permit, setPermit] = useState<Permit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [commentModal, setCommentModal] = useState<{ actionKey: string; label: string } | null>(null);
  const [comment, setComment] = useState("");
  const [rejectModal, setRejectModal] = useState<string | null>(null); // approvalId
async function refresh() {
  if (!id) return;
  try {
    const data = await api.get<Permit>(`/permits/${id}`);
    setPermit(data);
  } catch (err) {
    setError(err instanceof ApiRequestError ? err.message : "Could not load permit");
  }
}

useEffect(() => {
  let cancelled = false;

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Permit>(`/permits/${id}`);
      if (!cancelled) setPermit(data);
    } catch (err) {
      if (!cancelled) {
        setError(err instanceof ApiRequestError ? err.message : "Could not load permit");
      }
    } finally {
      if (!cancelled) setLoading(false);
    }
  }

  load();
  return () => {
    cancelled = true;
  };
}, [id]);

  async function runAction(actionKey: string, body?: { comment?: string }) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/permits/${id}/${actionKey}`, body ?? {});
     await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Action failed");
    } finally {
      setBusy(false);
      setCommentModal(null);
      setComment("");
    }
  }

  async function decideApproval(approvalId: string, decision: "APPROVED" | "REJECTED", reason?: string) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/permits/${id}/approvals/${approvalId}/decide`, { decision, comment: reason });
     await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not record decision");
    } finally {
      setBusy(false);
      setRejectModal(null);
      setComment("");
    }
  }

  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (error && !permit) return <div className="page"><p className="error-text">{error}</p></div>;
  if (!permit || !user) return null;

  const actions = getAvailableActions(permit, user);
  const myPendingApproval = permit.approvals?.find(
    (a) => a.decision === "PENDING" && (a.requiredRole === user.role || user.role === "ADMIN")
  );

  return (
    <div>
      <div className="topbar topbar-dark">
        <div className="topbar-brand" style={{ cursor: "pointer" }} onClick={() => navigate("/dashboard")}>
          ← Permits
        </div>
        <div className="topbar-user">
          <span>{user.name} <span className="muted">· {user.role.replace("_", " ")}</span></span>
        </div>
      </div>

      <div className="page" style={{ maxWidth: 900 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div className="mono muted" style={{ fontSize: 12, marginBottom: 6 }}>{permit.number}</div>
            <h2 style={{ fontSize: 22, marginBottom: 6 }}>{permit.workDescription}</h2>
            <p className="muted" style={{ fontSize: 13.5 }}>
              {permit.contractorName} · {permit.area?.name} ({permit.equipment?.tag})
            </p>
          </div>
          <span className={`badge ${STATUS_BADGE[permit.status]}`} style={{ fontSize: 13, padding: "6px 14px" }}>
            <span className="dot" />
            {STATUS_LABEL[permit.status]}
          </span>
        </div>

        {error && <div className="card" style={{ borderColor: "var(--danger)", marginBottom: 16 }}><p className="error-text">{error}</p></div>}

        {/* Approval prompt if this user has one pending */}
        {myPendingApproval && (
          <div className="card" style={{ borderColor: "var(--accent)", background: "var(--accent-dim)", marginBottom: 16 }}>
            <p style={{ fontWeight: 600, marginBottom: 10 }}>Your approval is needed</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" disabled={busy} onClick={() => decideApproval(myPendingApproval.id, "APPROVED")}>
                Approve
              </button>
              <button className="btn btn-danger" disabled={busy} onClick={() => setRejectModal(myPendingApproval.id)}>
                Reject
              </button>
            </div>
          </div>
        )}

        {/* Reject reason modal (inline card, not a real modal, to keep this simple) */}
        {rejectModal && (
          <div className="card" style={{ borderColor: "var(--danger)", marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12.5, color: "var(--text-muted)", marginBottom: 6 }}>
              Reason for rejection (required)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              style={{ width: "100%", padding: 9, border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: 10 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-danger"
                disabled={busy || !comment.trim()}
                onClick={() => decideApproval(rejectModal, "REJECTED", comment)}
              >
                Confirm rejection
              </button>
              <button className="btn" onClick={() => { setRejectModal(null); setComment(""); }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Core details */}
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, marginBottom: 14 }}>Details</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13.5 }}>
            <div><div className="muted" style={{ fontSize: 11.5 }}>Type</div>{permit.type.replace(/_/g, " ")}</div>
            <div><div className="muted" style={{ fontSize: 11.5 }}>Requester</div>{permit.requester?.name}</div>
            <div><div className="muted" style={{ fontSize: 11.5 }}>Planned start</div>{fmt(permit.plannedStart)}</div>
            <div><div className="muted" style={{ fontSize: 11.5 }}>Planned end</div>{fmt(permit.plannedEnd)}</div>
            <div><div className="muted" style={{ fontSize: 11.5 }}>Hazards</div>{permit.hazards.join(", ") || "—"}</div>
            <div><div className="muted" style={{ fontSize: 11.5 }}>PPE required</div>{permit.ppeRequired.join(", ") || "—"}</div>
          </div>
        </div>

        {/* Type-specific fields */}
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, marginBottom: 14 }}>{permit.type.replace(/_/g, " ")} details</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13.5 }}>
            {Object.entries(permit.typeData || {}).map(([k, v]) => (
              <div key={k}>
                <div className="muted" style={{ fontSize: 11.5 }}>{k.replace(/([A-Z])/g, " $1").trim()}</div>
                <div>{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Approvals */}
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, marginBottom: 14 }}>Approvals</h3>
          {(!permit.approvals || permit.approvals.length === 0) && (
            <p className="muted" style={{ fontSize: 13 }}>No approvals required yet — this permit hasn't been submitted.</p>
          )}
          {permit.approvals?.map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{a.requiredRole.replace("_", " ")}</div>
                {a.approver && <div className="muted" style={{ fontSize: 12 }}>{a.approver.name}</div>}
                {a.comment && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>"{a.comment}"</div>}
              </div>
              <span className={`badge ${a.decision === "APPROVED" ? "badge-active" : a.decision === "REJECTED" ? "badge-rejected" : "badge-pending"}`}>
                <span className="dot" />{a.decision}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        {actions.length > 0 && (
          <div className="card" style={{ marginBottom: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {actions.map((a) => (
              <button
                key={a.key}
                className={`btn ${a.variant === "primary" ? "btn-primary" : a.variant === "danger" ? "btn-danger" : ""}`}
                disabled={busy}
                onClick={() => (a.needsComment ? setCommentModal({ actionKey: a.key, label: a.label }) : runAction(a.key))}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        {commentModal && (
          <div className="card" style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12.5, color: "var(--text-muted)", marginBottom: 6 }}>
              Completion notes
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              style={{ width: "100%", padding: 9, border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: 10 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" disabled={busy} onClick={() => runAction(commentModal.actionKey, { comment })}>
                Confirm
              </button>
              <button className="btn" onClick={() => { setCommentModal(null); setComment(""); }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Audit trail */}
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 14 }}>Audit trail</h3>
          {(!permit.auditLogs || permit.auditLogs.length === 0) && <p className="muted" style={{ fontSize: 13 }}>No history yet.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {permit.auditLogs?.map((log, i) => (
              <div key={log.id} style={{ display: "flex", gap: 12, paddingBottom: 16, position: "relative" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", marginTop: 4 }} />
                  {i < permit.auditLogs!.length - 1 && <div style={{ width: 1, flex: 1, background: "var(--border)", marginTop: 4 }} />}
                </div>
                <div style={{ fontSize: 13 }}>
                  <div>
                    <strong>{log.actor?.name ?? "System"}</strong>{" "}
                    <span className="muted">{log.action.toLowerCase()}</span>
                    {log.fromStatus && log.toStatus && (
                      <span className="muted"> — {log.fromStatus} → {log.toStatus}</span>
                    )}
                  </div>
                  {log.comment && <div className="muted" style={{ marginTop: 2 }}>"{log.comment}"</div>}
                  <div className="muted mono" style={{ fontSize: 11, marginTop: 2 }}>{fmt(log.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}