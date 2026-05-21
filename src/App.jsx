import { useState, useEffect } from "react";
import { saveData, loadData, saveUsers, loadUsers } from "./firebase";
import { DEFAULT_USERS, authenticate, hashPassword, canEdit, canDelete, canViewReports, canManageUsers, filterPropertiesByUser } from "./auth";
import LoginScreen from "./LoginScreen";
import UserManager from "./UserManager";

const COLORS = {
  green: "#3B6D11", greenLight: "#EAF3DE", greenMid: "#639922",
  amber: "#BA7517", amberLight: "#FAEEDA",
  red: "#A32D2D", redLight: "#FCEBEB",
  blue: "#185FA5", blueLight: "#E6F1FB",
  gray: "#5F5E5A", grayLight: "#F1EFE8",
  teal: "#0F6E56", tealLight: "#E1F5EE",
};
const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const PRODUCT_TYPES = ["Adubo","Defensivo Fungicida","Defensivo Inseticida","Defensivo Herbicida","Micronutriente"];
const isDefensivo = (t) => t?.startsWith("Defensivo");
const isAdubo = (t) => t === "Adubo" || t === "Micronutriente";

const typeColor = (t) => {
  if (t === "Adubo") return { bg: COLORS.greenLight, text: COLORS.green };
  if (t?.includes("Fungicida")) return { bg: COLORS.blueLight, text: COLORS.blue };
  if (t?.includes("Inseticida")) return { bg: "#FBEAF0", text: "#993556" };
  if (t?.includes("Herbicida")) return { bg: COLORS.amberLight, text: COLORS.amber };
  if (t === "Micronutriente") return { bg: COLORS.tealLight, text: COLORS.teal };
  return { bg: COLORS.grayLight, text: COLORS.gray };
};

const Badge = ({ label, type }) => {
  const c = typeColor(type || label);
  return <span style={{ background: c.bg, color: c.text, fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>{label}</span>;
};
const Card = ({ children, style }) => (
  <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "1rem 1.25rem", ...style }}>{children}</div>
);
const MetricCard = ({ label, value, sub, color }) => (
  <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "0.75rem 1rem" }}>
    <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>{label}</p>
    <p style={{ fontSize: 20, fontWeight: 500, margin: 0, color: color || "var(--color-text-primary)" }}>{value}</p>
    {sub && <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "2px 0 0" }}>{sub}</p>}
  </div>
);
const SectionTitle = ({ children, action }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 0 10px" }}>
    <p style={{ fontWeight: 500, fontSize: 14, margin: 0 }}>{children}</p>
    {action}
  </div>
);
const PillTabs = ({ tabs, value, onChange }) => (
  <div style={{ display: "flex", gap: 6, background: "var(--color-background-secondary)", borderRadius: 10, padding: 4, marginBottom: 14 }}>
    {tabs.map(t => (
      <button key={t.id} onClick={() => onChange(t.id)} style={{ flex: 1, padding: "7px 4px", borderRadius: 8, border: "none", background: value === t.id ? "var(--color-background-primary)" : "transparent", color: value === t.id ? "var(--color-text-primary)" : "var(--color-text-secondary)", fontWeight: value === t.id ? 500 : 400, fontSize: 13, cursor: "pointer" }}>
        {t.label}
      </button>
    ))}
  </div>
);

const initData = {
  properties: [
    { id: 1, name: "Fazenda Santa Rosa", area: 45, location: "Rolim de Moura - RO" },
    { id: 2, name: "Sítio Boa Esperança", area: 18, location: "Ji-Paraná - RO" },
  ],
  products: [
    { id: 1, name: "NPK 20-05-20", type: "Adubo", unit: "kg", dosePerHa: 120, stock: 3200, price: 4.5 },
    { id: 2, name: "Azoxistrobina", type: "Defensivo Fungicida", unit: "L", dosePerHa: 0.8, stock: 45, price: 85 },
    { id: 3, name: "Imidacloprido", type: "Defensivo Inseticida", unit: "L", dosePerHa: 0.5, stock: 20, price: 120 },
    { id: 4, name: "Boro Foliar", type: "Micronutriente", unit: "L", dosePerHa: 1.5, stock: 60, price: 35 },
  ],
  schedules: [
    { id: 1, productId: 1, propertyId: 1, months: [1,4,7,10], notes: "Adubação cobertura" },
    { id: 2, productId: 2, propertyId: 1, months: [2,5,8,11], notes: "Controle ferrugem" },
    { id: 3, productId: 3, propertyId: 2, months: [3,6,9], notes: "Broca do café" },
    { id: 4, productId: 4, propertyId: 1, months: [1,6,11], notes: "Nutrição foliar" },
  ],
  applications: [
    { id: 1, productId: 1, propertyId: 1, date: "2025-01-15", areaApplied: 45, qty: 5400, notes: "Concluída" },
    { id: 2, productId: 4, propertyId: 1, date: "2025-01-20", areaApplied: 45, qty: 67.5, notes: "Concluída" },
    { id: 3, productId: 2, propertyId: 1, date: "2025-02-10", areaApplied: 45, qty: 36, notes: "Concluída" },
    { id: 4, productId: 3, propertyId: 2, date: "2025-03-05", areaApplied: 18, qty: 9, notes: "Concluída" },
  ],
  purchases: [
    { id: 1, productId: 1, date: "2025-01-05", qty: 5000, totalCost: 22500 },
    { id: 2, productId: 2, date: "2025-01-10", qty: 50, totalCost: 4250 },
    { id: 3, productId: 3, date: "2025-02-15", qty: 30, totalCost: 3600 },
  ],
  notifications: [
    { id: 1, msg: "NPK 20-05-20 programado para Abr em Santa Rosa", type: "schedule", read: false },
    { id: 2, msg: "Estoque de Imidacloprido abaixo de 25 unidades", type: "stock", read: false },
  ],
};

function BarChart({ data, color }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, padding: "0 4px" }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
          <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
            <div style={{ width: "100%", background: color || COLORS.greenMid, borderRadius: "4px 4px 0 0", height: ((d.value / max) * 100) + "%", minHeight: d.value > 0 ? 4 : 0 }} />
          </div>
          <span style={{ fontSize: 10, color: "var(--color-text-secondary)", textAlign: "center" }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function PieChart({ slices }) {
  const total = slices.reduce((a, b) => a + b.value, 0);
  if (!total) return <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Sem dados.</p>;
  let cum = 0;
  const paths = slices.map((s, i) => {
    const pct = s.value / total;
    const s0 = cum * 360, e0 = (cum + pct) * 360;
    cum += pct;
    const r2xy = (deg) => { const r = deg * Math.PI / 180; return [50 + 40 * Math.sin(r), 50 - 40 * Math.cos(r)]; };
    const [x1,y1] = r2xy(s0), [x2,y2] = r2xy(e0);
    return <path key={i} d={"M50,50 L" + x1 + "," + y1 + " A40,40,0," + (pct > 0.5 ? 1 : 0) + ",1," + x2 + "," + y2 + " Z"} fill={s.color} />;
  });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <svg viewBox="0 0 100 100" width={90} height={90}>{paths}</svg>
      <div style={{ flex: 1 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: "var(--color-text-secondary)", flex: 1 }}>{s.label}</span>
            <span style={{ fontWeight: 500 }}>{"R$ " + s.value.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const StockCard = ({ p, properties, onEdit, onDelete }) => {
  const maxM = Math.max(...properties.map(pr => p.dosePerHa * pr.area), 1);
  const mLeft = Math.floor(p.stock / maxM);
  const pct = Math.min(100, (p.stock / (p.dosePerHa * 100)) * 100);
  const bar = mLeft < 1 ? COLORS.red : mLeft < 3 ? COLORS.amber : COLORS.greenMid;
  return (
    <Card style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <div><p style={{ fontWeight: 500, margin: "0 0 4px", fontSize: 14 }}>{p.name}</p><Badge label={p.type} type={p.type} /></div>
        <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <p style={{ fontWeight: 500, margin: 0, fontSize: 16, color: bar }}>{p.stock} {p.unit}</p>
          <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>{"~" + mLeft + " meses"}</p>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onEdit} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer" }}>✏️</button>
            <button onClick={onDelete} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer", color: COLORS.red }}>🗑</button>
          </div>
        </div>
      </div>
      <div style={{ background: "var(--color-background-secondary)", borderRadius: 4, height: 6 }}>
        <div style={{ width: pct + "%", background: bar, height: "100%", borderRadius: 4 }} />
      </div>
      <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "4px 0 0" }}>{p.dosePerHa + " " + p.unit + "/ha · R$ " + (p.price || 0).toFixed(2) + "/" + p.unit}</p>
    </Card>
  );
};

const AppCard = ({ a, products, properties, onEdit, onDelete, appCost }) => {
  const prod = products.find(p => p.id === a.productId);
  const pr = properties.find(p => p.id === a.propertyId);
  return (
    <Card style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 500, margin: "0 0 2px", fontSize: 14 }}>{prod?.name}</p>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>{(pr?.name || "") + " · " + a.date}</p>
          <Badge label={prod?.type} type={prod?.type} />
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "6px 0 0" }}>
            {a.qty + " " + (prod?.unit || "") + " em " + a.areaApplied + " ha · "}<span style={{ color: COLORS.teal, fontWeight: 500 }}>{"R$ " + appCost(a).toFixed(2)}</span>
          </p>
          {a.notes && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "2px 0 0" }}>{a.notes}</p>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={onEdit} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer" }}>✏️</button>
          <button onClick={onDelete} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer", color: COLORS.red }}>🗑</button>
        </div>
      </div>
    </Card>
  );
};

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState(initData);
  const [loading, setLoading] = useState(true);
  const [selectedProp, setSelectedProp] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [notifOpen, setNotifOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [stockFilter, setStockFilter] = useState("defensivo");
  const [appFilter, setAppFilter] = useState("defensivo");
  const [appPropFilter, setAppPropFilter] = useState(0);

  // Auth
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loginError, setLoginError] = useState("");

  // Carrega dados e usuários
  useEffect(() => {
    const load = async () => {
      const [saved, savedUsers] = await Promise.all([loadData(), loadUsers()]);
      if (saved) setData(saved);
      setUsers(savedUsers || DEFAULT_USERS.map(u => ({ ...u, password: hashPassword(u.password) })));
      setLoading(false);
    };
    load();
  }, []);

  // Salva dados
  useEffect(() => {
    if (!loading && currentUser) saveData(data);
  }, [data]);

  // Salva usuários
  useEffect(() => {
    if (!loading && users.length > 0) saveUsers(users);
  }, [users]);

  const handleLogin = (username, password) => {
    const user = authenticate(users, username, password);
    if (user) { setCurrentUser(user); setLoginError(""); }
    else setLoginError("Usuário ou senha incorretos.");
  };

  const handleLogout = () => { setCurrentUser(null); setTab("dashboard"); };

  // Propriedades filtradas pelo usuário logado
  const visibleProperties = currentUser ? filterPropertiesByUser(data.properties, currentUser) : [];

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#3B6D11", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 40 }}>🌿</div>
      <p style={{ fontSize: 16 }}>Carregando AgroGestão...</p>
    </div>
  );

  if (!currentUser) return <LoginScreen onLogin={handleLogin} error={loginError} />;
  
  const unread = data.notifications.filter(n => !n.read).length;
  const markAllRead = () => setData(d => ({ ...d, notifications: d.notifications.map(n => ({ ...n, read: true })) }));

  const appCost = (a) => {
    const prod = data.products.find(p => p.id === a.productId);
    return (prod?.price || 0) * a.qty;
  };
  const propCost = (propId) => data.applications.filter(a => a.propertyId === propId).reduce((s, a) => s + appCost(a), 0);

  const save = (type, item) => {
    setData(d => {
      const key = { application:"applications", purchase:"purchases", product:"products", schedule:"schedules", property:"properties" }[type];
      const arr = d[key];
      const idx = arr.findIndex(x => x.id === item.id);
      if (type === "application") {
        if (idx === -1) return { ...d, applications: [...arr, item], products: d.products.map(p => p.id === item.productId ? { ...p, stock: Math.max(0, p.stock - item.qty) } : p), notifications: [...d.notifications, { id: Date.now()+1, msg: "Aplicação registrada", type: "done", read: false }] };
        const diff = item.qty - arr[idx].qty;
        return { ...d, applications: arr.map(x => x.id === item.id ? item : x), products: d.products.map(p => p.id === item.productId ? { ...p, stock: Math.max(0, p.stock - diff) } : p) };
      }
      if (type === "purchase") {
        if (idx === -1) return { ...d, purchases: [...arr, item], products: d.products.map(p => p.id === item.productId ? { ...p, stock: p.stock + item.qty } : p) };
        const diff = item.qty - arr[idx].qty;
        return { ...d, purchases: arr.map(x => x.id === item.id ? item : x), products: d.products.map(p => p.id === item.productId ? { ...p, stock: p.stock + diff } : p) };
      }
      return { ...d, [key]: idx === -1 ? [...arr, item] : arr.map(x => x.id === item.id ? item : x) };
    });
    setModal(null);
  };

  const del = (type, id) => {
    const key = { application:"applications", purchase:"purchases", product:"products", schedule:"schedules", property:"properties" }[type];
    setData(d => ({ ...d, [key]: d[key].filter(x => x.id !== id) }));
    setConfirm(null);
  };

  const exportCSV = () => {
    const rows = [["Data","Propriedade","Produto","Tipo","Área (ha)","Qtd","Unidade","Custo (R$)","Obs"]];
    data.applications.forEach(a => {
      const prod = data.products.find(p => p.id === a.productId);
      const pr = data.properties.find(p => p.id === a.propertyId);
      rows.push([a.date, pr?.name, prod?.name, prod?.type, a.areaApplied, a.qty, prod?.unit, appCost(a).toFixed(2), a.notes]);
    });
    const blob = new Blob(["\uFEFF" + rows.map(r => r.join(";")).join("\n")], { type: "text/csv;charset=utf-8;" });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = "agro_gestao.csv"; el.click();
  };

  const exportTxt = () => {
    let txt = "RELATÓRIO AGROGESTÃO CAFÉ\n" + "=".repeat(40) + "\n\n";
    data.properties.forEach(p => {
      txt += "PROPRIEDADE: " + p.name + " — " + p.area + " ha\n";
      let total = 0;
      data.applications.filter(a => a.propertyId === p.id).forEach(a => {
        const prod = data.products.find(pr => pr.id === a.productId);
        const c = appCost(a); total += c;
        txt += "  " + a.date + " | " + prod?.name + " | " + a.qty + " " + prod?.unit + " | R$ " + c.toFixed(2) + "\n";
      });
      txt += "  TOTAL: R$ " + total.toFixed(2) + "\n\n";
    });
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8;" });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = "relatorio_agro.txt"; el.click();
  };

const navItems = [
  { id: "dashboard", icon: "📊", label: "Início" },
  { id: "calendar",  icon: "📅", label: "Cronograma" },
  { id: "apply",     icon: "💧", label: "Aplicações" },
  { id: "stock",     icon: "📦", label: "Estoque" },
  { id: "reports",   icon: "📈", label: "Relatórios", restricted: true },
  { id: "users",     icon: "👥", label: "Usuários", masterOnly: true },
];

  const filteredApps = (filter) => {
    const fn = filter === "defensivo" ? isDefensivo : isAdubo;
    return data.applications.filter(a => {
      const prod = data.products.find(p => p.id === a.productId);
      return fn(prod?.type) && (appPropFilter === 0 || a.propertyId === appPropFilter);
    }).sort((a, b) => b.date.localeCompare(a.date));
  };

  const propSel = data.properties.find(p => p.id === selectedProp);

  return (
    <div style={{ fontFamily: "var(--font-sans)", maxWidth: 420, margin: "0 auto", paddingBottom: 84 }}>
    <div style={{ background: COLORS.green, color: "#fff", padding: "1rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 500 }}>🌿 AgroGestão</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{currentUser.name} · <span style={{ opacity: 0.75 }}>{currentUser.role}</span></div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
       <button onClick={() => setNotifOpen(!notifOpen)} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 20, padding: "6px 12px", color: "#fff", cursor: "pointer", fontSize: 14, position: "relative" }}>
      🔔{unread > 0 && <span style={{ background: COLORS.red, color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 5px", position: "absolute", top: 2, right: 2 }}>{unread}</span>}
       </button>
       <button onClick={handleLogout} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 20, padding: "6px 12px", color: "#fff", cursor: "pointer", fontSize: 13 }}>Sair</button>
     </div>
    </div>

      {notifOpen && (
        <Card style={{ borderRadius: 0, borderLeft: "none", borderRight: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontWeight: 500, fontSize: 14 }}>Notificações</span>
            <button onClick={markAllRead} style={{ fontSize: 12, color: COLORS.green, background: "none", border: "none", cursor: "pointer" }}>Marcar lidas</button>
          </div>
          {data.notifications.map(n => (
            <div key={n.id} style={{ padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 13, color: n.read ? "var(--color-text-secondary)" : "var(--color-text-primary)", display: "flex", gap: 8 }}>
              <span>{n.type === "schedule" ? "📅" : n.type === "stock" ? "📦" : "✅"}</span><span>{n.msg}</span>
            </div>
          ))}
        </Card>
      )}

      <div style={{ padding: "1rem" }}>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 16, margin: 0 }}>Visão geral</p>
              <button onClick={() => setModal({ type: "property", item: {} })} style={{ fontSize: 13, background: COLORS.green, color: "#fff", border: "none", borderRadius: 20, padding: "5px 14px", cursor: "pointer" }}>+ Lavoura</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <MetricCard label="Propriedades" value={data.properties.length} sub="cadastradas" />
              <MetricCard label="Produtos" value={data.products.length} sub="no portfólio" />
              <MetricCard label="Aplicações" value={data.applications.length} sub="registradas" />
              <MetricCard label="Est. crítico" value={data.products.filter(p => p.stock < p.dosePerHa * 20).length} sub="produtos" color={COLORS.red} />
            </div>

            <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 8px" }}>Propriedades cadastradas</p>
            {data.properties.map(p => (
              <Card key={p.id} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: COLORS.greenLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🌱</div>
                    <div>
                      <p style={{ fontWeight: 500, margin: "0 0 2px", fontSize: 14 }}>{p.name}</p>
                      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>{p.location + " · " + p.area + " ha"}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setModal({ type: "property", item: { ...p } })} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer" }}>✏️</button>
                    <button onClick={() => setConfirm({ type: "property", id: p.id, label: p.name })} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer", color: COLORS.red }}>🗑</button>
                  </div>
                </div>
              </Card>
            ))}

            <p style={{ fontWeight: 500, fontSize: 14, margin: "20px 0 8px" }}>Agenda do mês atual</p>
            {(() => {
              const cur = new Date().getMonth() + 1;
              const items = data.schedules.filter(s => s.months.includes(cur));
              if (!items.length) return <p style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Nenhuma aplicação este mês.</p>;
              return items.map(s => {
                const prod = data.products.find(p => p.id === s.productId);
                const pr = data.properties.find(p => p.id === s.propertyId);
                const done = data.applications.some(a => a.productId === s.productId && a.propertyId === s.propertyId && new Date(a.date).getMonth() + 1 === cur);
                return (
                  <Card key={s.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div><p style={{ fontWeight: 500, margin: "0 0 4px", fontSize: 14 }}>{prod?.name}</p><p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 6px" }}>{pr?.name}</p><Badge label={prod?.type} type={prod?.type} /></div>
                      {done
                        ? <span style={{ fontSize: 12, color: COLORS.green, background: COLORS.greenLight, padding: "4px 10px", borderRadius: 20 }}>✓ Feito</span>
                        : <button onClick={() => setModal({ type: "application", item: { productId: s.productId, propertyId: s.propertyId, areaApplied: pr?.area, qty: ((prod?.dosePerHa || 0) * (pr?.area || 1)).toFixed(1), date: new Date().toISOString().split("T")[0] } })} style={{ fontSize: 12, background: COLORS.green, color: "#fff", border: "none", borderRadius: 20, padding: "4px 10px", cursor: "pointer" }}>Registrar</button>}
                    </div>
                  </Card>
                );
              });
            })()}

            <p style={{ fontWeight: 500, fontSize: 14, margin: "20px 0 8px" }}>Estoque crítico</p>
            {data.products.filter(p => p.stock < p.dosePerHa * 20).map(p => (
              <Card key={p.id} style={{ marginBottom: 8, borderLeft: "3px solid " + COLORS.red, borderRadius: "0 12px 12px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div><p style={{ fontWeight: 500, margin: "0 0 2px", fontSize: 14 }}>{p.name}</p><p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>{p.stock + " " + p.unit + " em estoque"}</p></div>
                  <Badge label={p.type} type={p.type} />
                </div>
              </Card>
            ))}
            {data.products.filter(p => p.stock < p.dosePerHa * 20).length === 0 && <p style={{ color: COLORS.green, fontSize: 13 }}>✓ Todos os estoques adequados</p>}
          </div>
        )}

        {/* CRONOGRAMA */}
        {tab === "calendar" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 16, margin: 0 }}>Cronograma</p>
              <button onClick={() => setModal({ type: "schedule", item: {} })} style={{ fontSize: 13, background: COLORS.green, color: "#fff", border: "none", borderRadius: 20, padding: "5px 14px", cursor: "pointer" }}>+ Programar</button>
            </div>
            <select value={selectedProp} onChange={e => setSelectedProp(Number(e.target.value))} style={{ width: "100%", marginBottom: 12, padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", fontSize: 14 }}>
              {data.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 16 }}>
              {MONTHS.map((m, i) => {
                const has = data.schedules.some(s => s.propertyId === selectedProp && s.months.includes(i + 1));
                const sel = selectedMonth === i;
                return (
                  <button key={m} onClick={() => setSelectedMonth(i)} style={{ padding: "8px 4px", borderRadius: 8, border: "0.5px solid " + (sel ? COLORS.green : "var(--color-border-tertiary)"), background: sel ? COLORS.greenLight : "var(--color-background-primary)", color: sel ? COLORS.green : "var(--color-text-primary)", fontSize: 12, fontWeight: sel ? 500 : 400, cursor: "pointer", position: "relative" }}>
                    {m}{has && <span style={{ width: 5, height: 5, background: COLORS.greenMid, borderRadius: "50%", position: "absolute", bottom: 3, right: "50%", transform: "translateX(50%)", display: "block" }} />}
                  </button>
                );
              })}
            </div>
            <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 8px" }}>{"Aplicações em " + MONTHS[selectedMonth]}</p>
            {(() => {
              const area = propSel?.area || 1;
              const items = data.schedules.filter(s => s.propertyId === selectedProp && s.months.includes(selectedMonth + 1));
              if (!items.length) return <p style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Nenhuma aplicação neste mês.</p>;
              return items.map(s => {
                const prod = data.products.find(p => p.id === s.productId);
                const totalQty = ((prod?.dosePerHa || 0) * area).toFixed(1);
                const done = data.applications.some(a => a.productId === s.productId && a.propertyId === s.propertyId && new Date(a.date).getMonth() === selectedMonth);
                return (
                  <Card key={s.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 500, margin: "0 0 4px", fontSize: 14 }}>{prod?.name}</p>
                        <Badge label={prod?.type} type={prod?.type} />
                        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "6px 0 0" }}>{"Dose: " + prod?.dosePerHa + " " + prod?.unit + "/ha · Total: " + totalQty + " " + prod?.unit}</p>
                        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "2px 0 0" }}>{s.notes}</p>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button onClick={() => setModal({ type: "schedule", item: { ...s } })} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 16, padding: "4px 8px", cursor: "pointer" }}>✏️</button>
                        <button onClick={() => setConfirm({ type: "schedule", id: s.id, label: prod?.name })} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 16, padding: "4px 8px", cursor: "pointer", color: COLORS.red }}>🗑</button>
                        {done
                          ? <span style={{ fontSize: 12, color: COLORS.green, background: COLORS.greenLight, padding: "4px 10px", borderRadius: 20 }}>✓</span>
                          : <button onClick={() => setModal({ type: "application", item: { productId: s.productId, propertyId: s.propertyId, areaApplied: area, qty: totalQty, date: new Date().toISOString().split("T")[0] } })} style={{ fontSize: 12, background: COLORS.green, color: "#fff", border: "none", borderRadius: 20, padding: "4px 10px", cursor: "pointer" }}>Registrar</button>}
                      </div>
                    </div>
                  </Card>
                );
              });
            })()}
          </div>
        )}

        {/* APLICAÇÕES */}
        {tab === "apply" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 16, margin: 0 }}>Aplicações</p>
              <button onClick={() => setModal({ type: "application", item: {} })} style={{ fontSize: 13, background: COLORS.green, color: "#fff", border: "none", borderRadius: 20, padding: "5px 14px", cursor: "pointer" }}>+ Registrar</button>
            </div>
            <select value={appPropFilter} onChange={e => setAppPropFilter(Number(e.target.value))} style={{ width: "100%", marginBottom: 12, padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", fontSize: 14 }}>
              <option value={0}>Todas as propriedades</option>
              {data.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <PillTabs tabs={[{ id: "defensivo", label: "💊 Defensivos" }, { id: "adubo", label: "🌾 Adubos" }]} value={appFilter} onChange={setAppFilter} />
            {filteredApps(appFilter).length === 0
              ? <p style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Nenhuma aplicação encontrada.</p>
              : filteredApps(appFilter).map(a => (
                <AppCard key={a.id} a={a} products={data.products} properties={data.properties} appCost={appCost}
                  onEdit={() => setModal({ type: "application", item: { ...a } })}
                  onDelete={() => setConfirm({ type: "application", id: a.id, label: data.products.find(p => p.id === a.productId)?.name })} />
              ))
            }
          </div>
        )}

        {/* ESTOQUE */}
        {tab === "stock" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 16, margin: 0 }}>Estoque</p>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setModal({ type: "purchase", item: {} })} style={{ fontSize: 12, background: COLORS.teal, color: "#fff", border: "none", borderRadius: 20, padding: "5px 12px", cursor: "pointer" }}>+ Compra</button>
                <button onClick={() => setModal({ type: "product", item: {} })} style={{ fontSize: 12, background: COLORS.green, color: "#fff", border: "none", borderRadius: 20, padding: "5px 12px", cursor: "pointer" }}>+ Produto</button>
              </div>
            </div>
            <PillTabs tabs={[{ id: "defensivo", label: "💊 Defensivos" }, { id: "adubo", label: "🌾 Adubos" }]} value={stockFilter} onChange={setStockFilter} />
            {data.products.filter(p => stockFilter === "defensivo" ? isDefensivo(p.type) : isAdubo(p.type)).map(p => (
              <StockCard key={p.id} p={p} properties={data.properties}
                onEdit={() => setModal({ type: "product", item: { ...p } })}
                onDelete={() => setConfirm({ type: "product", id: p.id, label: p.name })} />
            ))}
            <SectionTitle>Histórico de compras</SectionTitle>
            {data.purchases.slice().reverse().map(c => {
              const prod = data.products.find(p => p.id === c.productId);
              if (!prod) return null;
              const show = stockFilter === "defensivo" ? isDefensivo(prod.type) : isAdubo(prod.type);
              if (!show) return null;
              return (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 13 }}>
                  <div><p style={{ margin: 0, fontWeight: 500 }}>{prod.name}</p><p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 12 }}>{c.date + " · " + c.qty + " " + prod.unit}</p></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={{ margin: 0, color: COLORS.teal, fontWeight: 500 }}>{"R$ " + (c.totalCost || 0).toLocaleString("pt-BR")}</p>
                    <button onClick={() => setModal({ type: "purchase", item: { ...c } })} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer" }}>✏️</button>
                    <button onClick={() => setConfirm({ type: "purchase", id: c.id, label: prod.name })} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer", color: COLORS.red }}>🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

	{/* USUÁRIOS */}
	{tab === "users" && canManageUsers(currentUser.role) && (
 	 <UserManager
   	 users={users}
   	 setUsers={setUsers}
   	 properties={data.properties}
   	 currentUser={currentUser}
 	 />
	)}

        {/* RELATÓRIOS */}
        {tab === "reports" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 16, margin: 0 }}>Relatórios</p>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={exportCSV} style={{ fontSize: 12, background: COLORS.teal, color: "#fff", border: "none", borderRadius: 20, padding: "5px 12px", cursor: "pointer" }}>📥 CSV</button>
                <button onClick={exportTxt} style={{ fontSize: 12, background: COLORS.blue, color: "#fff", border: "none", borderRadius: 20, padding: "5px 12px", cursor: "pointer" }}>📄 TXT</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <MetricCard label="Total em aplicações" value={"R$ " + data.applications.reduce((s,a) => s + appCost(a), 0).toLocaleString("pt-BR", { minimumFractionDigits: 0 })} />
              <MetricCard label="Total em compras" value={"R$ " + data.purchases.reduce((s,p) => s + (p.totalCost || 0), 0).toLocaleString("pt-BR", { minimumFractionDigits: 0 })} />
            </div>
            <Card style={{ marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 10px" }}>Custo por propriedade</p>
              {data.properties.map(p => {
                const cost = propCost(p.id);
                const total = data.applications.reduce((s,a) => s + appCost(a), 0);
                const pct = total > 0 ? (cost / total * 100).toFixed(0) : 0;
                return (
                  <div key={p.id} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                      <span>{p.name}</span>
                      <span style={{ fontWeight: 500 }}>{"R$ " + cost.toLocaleString("pt-BR", { minimumFractionDigits: 0 }) + " "}<span style={{ color: "var(--color-text-secondary)", fontWeight: 400 }}>{"(" + pct + "%)"}</span></span>
                    </div>
                    <div style={{ background: "var(--color-background-secondary)", borderRadius: 4, height: 8 }}>
                      <div style={{ width: pct + "%", background: COLORS.greenMid, height: "100%", borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </Card>
            <Card style={{ marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 10px" }}>Custo por produto</p>
              <PieChart slices={data.products.map((p, i) => ({ label: p.name, value: data.applications.filter(a => a.productId === p.id).reduce((s,a) => s + appCost(a), 0), color: [COLORS.greenMid, COLORS.blue, "#D4537E", COLORS.amber, COLORS.teal][i % 5] })).filter(s => s.value > 0)} />
            </Card>
            <Card style={{ marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 10px" }}>Aplicações por mês</p>
              <BarChart data={MONTHS.map((m, i) => ({ label: m, value: data.applications.filter(a => new Date(a.date).getMonth() === i).length }))} color={COLORS.greenMid} />
            </Card>
            <Card style={{ marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 10px" }}>Custo mensal (R$)</p>
              <BarChart data={MONTHS.map((m, i) => ({ label: m, value: data.applications.filter(a => new Date(a.date).getMonth() === i).reduce((s,a) => s + appCost(a), 0) }))} color={COLORS.teal} />
            </Card>
          </div>
        )}
      </div>

      {modal && <FormModal modal={modal} data={data} onClose={() => setModal(null)} onSave={save} />}

      {confirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "var(--color-background-primary)", borderRadius: 16, padding: "1.5rem", width: "100%", maxWidth: 340 }}>
            <p style={{ fontWeight: 500, fontSize: 16, margin: "0 0 8px" }}>Confirmar exclusão</p>
            <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: "0 0 20px" }}>Deseja excluir <strong>{confirm.label}</strong>? Esta ação não pode ser desfeita.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirm(null)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "0.5px solid var(--color-border-tertiary)", background: "none", cursor: "pointer", fontSize: 14 }}>Cancelar</button>
              <button onClick={() => del(confirm.type, confirm.id)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: COLORS.red, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>Excluir</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 420, background: "var(--color-background-primary)",         borderTop: "0.5px solid var(--color-border-tertiary)", display: "flex" }}>
      {navItems
      .filter(n => !n.masterOnly || canManageUsers(currentUser.role))
      .filter(n => !n.restricted || canViewReports(currentUser.role))
      .map(n => (
        <button key={n.id} onClick={() => setTab(n.id)} style={{ flex: 1, padding: "8px 2px 12px", border: "none", background: "none", cursor: "pointer", color: tab === n.id ?    COLORS.green : "var(--color-text-secondary)", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span style={{ fontSize: 18 }}>{n.icon}</span>
          <span style={{ fontSize: 9, fontWeight: tab === n.id ? 500 : 400 }}>{n.label}</span>
        </button>
       ))}
      </div>
    </div>
  );
}

function FormModal({ modal, data, onClose, onSave }) {
  const isEdit = !!modal.item?.id;
  const [form, setForm] = useState(modal.item || {});
  const [months, setMonths] = useState(modal.item?.months || []);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const titleMap = {
    application: isEdit ? "Editar Aplicação" : "Registrar Aplicação",
    purchase: isEdit ? "Editar Compra" : "Registrar Compra",
    product: isEdit ? "Editar Produto" : "Cadastrar Produto",
    schedule: isEdit ? "Editar Agendamento" : "Novo Agendamento",
    property: isEdit ? "Editar Lavoura" : "Nova Lavoura",
  };

  const submit = () => {
    const base = { ...form, id: form.id || Date.now() };
    if (modal.type === "application") onSave("application", { ...base, productId: Number(form.productId), propertyId: Number(form.propertyId), areaApplied: Number(form.areaApplied), qty: Number(form.qty) });
    else if (modal.type === "purchase") onSave("purchase", { ...base, productId: Number(form.productId), qty: Number(form.qty), totalCost: Number(form.totalCost) });
    else if (modal.type === "product") onSave("product", { ...base, dosePerHa: Number(form.dosePerHa), price: Number(form.price) });
    else if (modal.type === "schedule") onSave("schedule", { ...base, productId: Number(form.productId), propertyId: Number(form.propertyId), months });
    else if (modal.type === "property") onSave("property", { ...base, area: Number(form.area) });
  };

  const inp = (label, key, type, placeholder) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 13, color: "#fff", fontWeight: 700, display: "block", marginBottom: 5 }}>{label}</label>
      <input type={type || "text"} value={form[key] !== undefined ? form[key] : ""} onChange={e => set(key, e.target.value)} placeholder={placeholder || ""} style={{ width: "100%", boxSizing: "border-box" }} />
    </div>
  );

  const sel = (label, key, opts) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 5 }}>{label}</label>
      <select value={form[key] !== undefined ? form[key] : ""} onChange={e => set(key, e.target.value)} style={{ width: "100%" }}>
        <option value="">Selecione...</option>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  const renderFields = () => {
    if (modal.type === "application") return (
      <div>
        {sel("Produto", "productId", data.products.map(p => ({ value: p.id, label: p.name })))}
        {sel("Propriedade", "propertyId", data.properties.map(p => ({ value: p.id, label: p.name })))}
        {inp("Data da aplicação", "date", "date")}
        {inp("Área aplicada (ha)", "areaApplied", "number", "Ex: 45")}
        {inp("Quantidade utilizada", "qty", "number", "Ex: 36")}
        {inp("Observações", "notes", "text", "Ex: Concluída")}
      </div>
    );
    if (modal.type === "purchase") return (
      <div>
        {sel("Produto", "productId", data.products.map(p => ({ value: p.id, label: p.name })))}
        {inp("Data da compra", "date", "date")}
        {inp("Quantidade comprada", "qty", "number", "Ex: 200")}
        {inp("Custo total (R$)", "totalCost", "number", "Ex: 1500.00")}
      </div>
    );
    if (modal.type === "product") return (
      <div>
        {inp("Nome do produto", "name", "text", "Ex: NPK 20-05-20")}
        {sel("Tipo de produto", "type", PRODUCT_TYPES.map(t => ({ value: t, label: t })))}
        {inp("Unidade de medida", "unit", "text", "Ex: kg, L, g")}
        {inp("Dose por hectare", "dosePerHa", "number", "Ex: 120")}
        {inp("Preço unitário (R$)", "price", "number", "Ex: 4.50")}
      </div>
    );
    if (modal.type === "schedule") return (
      <div>
        {sel("Produto", "productId", data.products.map(p => ({ value: p.id, label: p.name })))}
        {sel("Propriedade", "propertyId", data.properties.map(p => ({ value: p.id, label: p.name })))}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, color: "#fff", fontWeight: 700, display: "block", marginBottom: 6 }}>Meses de aplicação</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
            {MONTHS.map((m, i) => (
              <button key={m} onClick={() => setMonths(ms => ms.includes(i+1) ? ms.filter(x => x !== i+1) : [...ms, i+1])}
                style={{ padding: "7px 4px", borderRadius: 8, border: "0.5px solid " + (months.includes(i+1) ? COLORS.green : "var(--color-border-tertiary)"), background: months.includes(i+1) ? COLORS.greenLight : "var(--color-background-secondary)", color: months.includes(i+1) ? COLORS.green : "var(--color-text-primary)", fontSize: 12, cursor: "pointer", fontWeight: months.includes(i+1) ? 500 : 400 }}>
                {m}
              </button>
            ))}
          </div>
        </div>
        {inp("Observações", "notes", "text", "Ex: Controle de ferrugem")}
      </div>
    );
    if (modal.type === "property") return (
      <div>
        {inp("Nome da propriedade", "name", "text", "Ex: Fazenda São João")}
        {inp("Localização", "location", "text", "Ex: Cacoal - RO")}
        {inp("Área total (ha)", "area", "number", "Ex: 35")}
      </div>
    );
    return null;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: COLORS.green, borderRadius: "20px 20px 0 0", padding: "1.5rem 1.25rem 2rem", width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <p style={{ fontWeight: 500, fontSize: 17, margin: 0, color: "#fff" }}>{titleMap[modal.type]}</p>
          <button onClick={onClose} style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "50%", width: 32, height: 32, fontSize: 16, cursor: "pointer", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        {renderFields()}
        <button onClick={submit} style={{ width: "100%", background: COLORS.green, color: "#fff", border: "none", borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 500, cursor: "pointer", marginTop: 4 }}>
          {isEdit ? "Salvar alterações" : "Adicionar"}
        </button>
      </div>
    </div>
  );
}