import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { user, logout } = useAuth();
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Dashboard</h1>
      <p>Logged in as {user?.name} ({user?.role})</p>
      <button onClick={logout}>Log out</button>
    </div>
  );
}