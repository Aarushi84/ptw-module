import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiRequestError } from "../api";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      {/* Left: hero panel */}
      <div className="login-hero">
        <div className="hero-lockup">
          <span className="hero-lockup-icon">
            <svg width="30" height="30" viewBox="0 0 28 28" fill="none">
              <path
                d="M14 2.5 23.5 8v11.5c0 .5-.3.9-.7 1.1L14 25.5 4.7 20.6c-.4-.2-.7-.6-.7-1.1V8L14 2.5Z"
                fill="#fff"
                fillOpacity="0.08"
                stroke="#fff"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path
                d="M9.8 14.2 12.6 17 18.3 10.8"
                stroke="#fff"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="21.5" cy="6.5" r="3" fill="var(--navy-900)" />
              <circle cx="21.5" cy="6.5" r="2.2" fill="var(--amber)" />
            </svg>
          </span>
          <span className="hero-wordmark">Permit to Work</span>
        </div>

        <div className="hero-mid">
          <div className="permit-tag">
            <span className="permit-tag-code">PTW-0047</span>
            <span className="permit-tag-label">Hot work in boiler house</span>
          </div>

          <h1 className="hero-heading">Authorize the work, not the guesswork.</h1>
          <p className="hero-copy">
            Welding, confined entry, work at height, electrical isolation — every
            hazardous job on the floor is authorized, tracked and closed here,
            with a full record of who approved what, and when.
          </p>
        </div>

        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-num">4</div>
            <div className="hero-stat-label">permit types</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-num">100%</div>
            <div className="hero-stat-label">server-enforced</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-num">0</div>
            <div className="hero-stat-label">self-approvals</div>
          </div>
        </div>
      </div>

      {/* Right: form panel */}
      <div className="login-form-panel">
        <div className="login-form-wrap">
          <h2 className="login-form-title">Sign in</h2>
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 24 }}>
            Use your work email and password
          </p>

          <form onSubmit={handleSubmit} className="glass-card">
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="error-text" style={{ marginBottom: 14 }}>{error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="login-footer-note">Trouble signing in? Contact your site safety officer.</p>
        </div>

        <div className="login-env-tag">v2.4.0 · production</div>
      </div>
    </div>
  );
}