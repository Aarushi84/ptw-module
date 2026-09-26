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
      if (err instanceof ApiRequestError) setError(err.message);
      else setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Permit to Work</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>Sign in to continue</p>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: 12 }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 16 }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        {error && <p style={{ color: "crimson", marginBottom: 12 }}>{error}</p>}
        <button type="submit" disabled={submitting} style={{ width: "100%", padding: 10 }}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <p style={{ marginTop: 20, fontSize: 12, color: "#888" }}>
        Demo: requester@ptw.test / areaowner@ptw.test / safety@ptw.test / admin@ptw.test — password123
      </p>
    </div>
  );
}