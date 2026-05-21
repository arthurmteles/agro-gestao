import { useState } from "react";

const GREEN = "#3B6D11";
const GREEN_LIGHT = "#EAF3DE";

export default function LoginScreen({ onLogin, error }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = () => {
    if (!username.trim() || !password.trim()) return;
    onLogin(username.trim(), password);
  };

  const handleKey = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div style={{ minHeight: "100vh", background: GREEN, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>🌿</div>
        <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 600, margin: 0 }}>AgroGestão</h1>
        <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, margin: "4px 0 0" }}>Café</p>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: "2rem 1.5rem", width: "100%", maxWidth: 360 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: "0 0 20px", color: "#1a1a1a" }}>Entrar no sistema</h2>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, color: "#6b6b6b", display: "block", marginBottom: 5 }}>Usuário</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Digite seu usuário"
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "0.5px solid #e0e0e0", fontSize: 14 }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: "#6b6b6b", display: "block", marginBottom: 5 }}>Senha</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPass ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Digite sua senha"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 40px 10px 12px", borderRadius: 8, border: "0.5px solid #e0e0e0", fontSize: 14 }}
            />
            <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#6b6b6b" }}>
              {showPass ? "🙈" : "👁️"}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ background: "#FCEBEB", color: "#A32D2D", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16 }}>
            ⚠️ {error}
          </div>
        )}

        <button onClick={handleSubmit} style={{ width: "100%", background: GREEN, color: "#fff", border: "none", borderRadius: 10, padding: 13, fontSize: 15, fontWeight: 500, cursor: "pointer" }}>
          Entrar
        </button>
      </div>

      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 24 }}>
        AgroGestão Café © {new Date().getFullYear()}
      </p>
    </div>
  );
}