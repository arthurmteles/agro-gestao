import { useState } from "react";
import { hashPassword } from "./auth";

const GREEN = "#3B6D11";
const GREEN_LIGHT = "#EAF3DE";
const RED = "#A32D2D";
const ROLES = [
  { value: "master", label: "Master — acesso total" },
  { value: "operador", label: "Operador — registra aplicações" },
  { value: "leitura", label: "Leitura — somente visualização" },
];

export default function UserManager({ users, setUsers, properties, currentUser }) {
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({});
  const [selProps, setSelProps] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openNew = () => { setForm({}); setSelProps([]); setModal("new"); };
  const openEdit = (u) => { setForm({ ...u, password: "" }); setSelProps(u.properties === "all" ? [] : (u.properties || [])); setModal("edit"); };

  const save = () => {
    if (!form.username || !form.name || !form.role) return;
    const props = form.role === "master" ? "all" : selProps;
    if (modal === "new") {
      if (!form.password) return;
      const newUser = { ...form, id: Date.now(), password: hashPassword(form.password), properties: props };
      setUsers([...users, newUser]);
    } else {
      const updated = users.map(u => u.id === form.id ? { ...u, ...form, password: form.password ? hashPassword(form.password) : u.password, properties: props } : u);
      setUsers(updated);
    }
    setModal(null);
  };

  const del = (id) => { setUsers(users.filter(u => u.id !== id)); setConfirm(null); };

  const roleLabel = (role) => ({ master: "Master", operador: "Operador", leitura: "Leitura" }[role] || role);
  const roleColor = (role) => ({ master: { bg: GREEN_LIGHT, text: GREEN }, operador: { bg: "#E6F1FB", text: "#185FA5" }, leitura: { bg: "#F1EFE8", text: "#5F5E5A" } }[role] || {});

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ fontWeight: 500, fontSize: 16, margin: 0 }}>Usuários</p>
        <button onClick={openNew} style={{ fontSize: 13, background: GREEN, color: "#fff", border: "none", borderRadius: 20, padding: "5px 14px", cursor: "pointer" }}>+ Novo usuário</button>
      </div>

      {users.map(u => {
        const c = roleColor(u.role);
        const isSelf = u.id === currentUser.id;
        return (
          <div key={u.id} style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <p style={{ fontWeight: 500, margin: 0, fontSize: 14 }}>{u.name}</p>
                  {isSelf && <span style={{ fontSize: 11, background: "#EAF3DE", color: GREEN, borderRadius: 20, padding: "1px 8px" }}>você</span>}
                </div>
                <p style={{ fontSize: 12, color: "#6b6b6b", margin: "0 0 6px" }}>@{u.username}</p>
                <span style={{ background: c.bg, color: c.text, fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20 }}>{roleLabel(u.role)}</span>
                {u.role !== "master" && (
                  <p style={{ fontSize: 12, color: "#6b6b6b", margin: "6px 0 0" }}>
                    {u.properties === "all" ? "Todas as propriedades" : (u.properties || []).length + " propriedade(s)"}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => openEdit(u)} style={{ fontSize: 12, background: "none", border: "0.5px solid #e0e0e0", borderRadius: 14, padding: "2px 8px", cursor: "pointer" }}>✏️</button>
                {!isSelf && <button onClick={() => setConfirm(u)} style={{ fontSize: 12, background: "none", border: "0.5px solid #e0e0e0", borderRadius: 14, padding: "2px 8px", cursor: "pointer", color: RED }}>🗑</button>}
              </div>
            </div>
          </div>
        );
      })}

      {/* Modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: GREEN, borderRadius: "20px 20px 0 0", padding: "1.5rem 1.25rem 2rem", width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <p style={{ fontWeight: 500, fontSize: 17, margin: 0, color: "#fff" }}>{modal === "new" ? "Novo usuário" : "Editar usuário"}</p>
              <button onClick={() => setModal(null)} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", width: 32, height: 32, fontSize: 16, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {[["Nome completo","name","text","Ex: João Silva"],["Usuário (login)","username","text","Ex: joao"],["Senha" + (modal==="edit"?" (deixe em branco para manter)":""),"password","password","Digite a senha"]].map(([label,key,type,ph]) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, color: "#fff", fontWeight: 700, display: "block", marginBottom: 5 }}>{label}</label>
                <input type={type} value={form[key] || ""} onChange={e => set(key, e.target.value)} placeholder={ph} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "none", fontSize: 14 }} />
              </div>
            ))}

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, color: "#fff", fontWeight: 700, display: "block", marginBottom: 5 }}>Nível de acesso</label>
              <select value={form.role || ""} onChange={e => set("role", e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "none", fontSize: 14 }}>
                <option value="">Selecione...</option>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {form.role && form.role !== "master" && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, color: "#fff", fontWeight: 700, display: "block", marginBottom: 8 }}>Propriedades com acesso</label>
                {properties.map(p => (
                  <div key={p.id} onClick={() => setSelProps(ps => ps.includes(p.id) ? ps.filter(x => x !== p.id) : [...ps, p.id])}
                    style={{ display: "flex", alignItems: "center", gap: 10, background: selProps.includes(p.id) ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 12px", marginBottom: 6, cursor: "pointer" }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: "2px solid #fff", background: selProps.includes(p.id) ? "#fff" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {selProps.includes(p.id) && <span style={{ color: GREEN, fontSize: 12, fontWeight: 700 }}>✓</span>}
                    </div>
                    <div>
                      <p style={{ margin: 0, color: "#fff", fontSize: 13, fontWeight: 500 }}>{p.name}</p>
                      <p style={{ margin: 0, color: "rgba(255,255,255,0.7)", fontSize: 12 }}>{p.area} ha</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button onClick={save} style={{ width: "100%", background: "#fff", color: GREEN, border: "none", borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>
              {modal === "new" ? "Criar usuário" : "Salvar alterações"}
            </button>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "1.5rem", width: "100%", maxWidth: 340 }}>
            <p style={{ fontWeight: 500, fontSize: 16, margin: "0 0 8px" }}>Confirmar exclusão</p>
            <p style={{ fontSize: 14, color: "#6b6b6b", margin: "0 0 20px" }}>Deseja excluir o usuário <strong>{confirm.name}</strong>?</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirm(null)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "0.5px solid #e0e0e0", background: "none", cursor: "pointer", fontSize: 14 }}>Cancelar</button>
              <button onClick={() => del(confirm.id)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: RED, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}