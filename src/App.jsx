import { useState, useEffect, useRef } from "react";
import { loadData, saveUsers, loadUsers, updateUsers, updateData, subscribeData } from "./firebase";
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
const PRODUCT_TYPES = ["Adubo","Defensivo Fungicida","Defensivo Inseticida","Defensivo Herbicida","Defensivo Adjuvante","Defensivo Biológico","Defensivo Cola","Micronutriente"];
const isDefensivo = (t) => t?.startsWith("Defensivo");
const isAdubo = (t) => t === "Adubo" || t === "Micronutriente";
const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(v * 100) / 100;
// Preço unitário = média de (custo total ÷ quantidade) de cada compra do produto.
// Sem compras registradas, usa o preço antigo do cadastro (se existir).
const unitPrice = (p, purchases = []) => {
  const vals = purchases.filter(c => String(c.productId) === String(p?.id) && num(c.qty) > 0 && num(c.totalCost) > 0).map(c => num(c.totalCost) / num(c.qty));
  if (vals.length) return vals.reduce((t, v) => t + v, 0) / vals.length;
  return num(p?.price);
};
const brl = (v) => "R$ " + num(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Defensivos: ordena pelo princípio ativo (sem princípio ativo, usa o nome)
const stockKey = (p) => (isDefensivo(p.type) && p.activeIngredient ? p.activeIngredient : p.name) || "";
const byStockKey = (a, b) => stockKey(a).localeCompare(stockKey(b), "pt-BR", { sensitivity: "base" }) || (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" });
// Índice do mês atual dentro de APP_MONTHS (ou 0 se fora do período)
const currentAppMonthIdx = () => { const n = new Date(); const i = APP_MONTHS.findIndex(m => m.month === n.getMonth() && m.year === n.getFullYear()); return i < 0 ? 0 : i; };
// Notificação de aplicação registrada (produto, propriedade, quantidade e mês)
const monthLabel = (dateStr) => { const d = new Date((dateStr || "") + "T12:00"); return isNaN(d) ? "sem data" : MONTHS[d.getMonth()] + "/" + d.getFullYear(); };
const buildAppNotif = (item, d, user) => {
  const pr = d.products.find(p => String(p.id) === String(item.productId));
  const prop = d.properties.find(p => String(p.id) === String(item.propertyId));
  const unit = pr?.unit || "";
  const bags = isAdubo(pr?.type) && pr?.bagWeight ? fmtSacos(num(item.qty) / pr.bagWeight) : null;
  const qtyText = round2(num(item.qty)) + " " + unit + (bags ? " (" + bags + " sacos)" : "");
  return {
    id: Date.now() + 1, type: "application", readBy: [],
    productId: item.productId, propertyId: item.propertyId, applicationId: item.id,
    productName: pr?.name || "Produto", propertyName: prop?.name || "", qtyText, month: monthLabel(item.date),
    at: new Date().toISOString(), by: user?.name || "",
    msg: (pr?.name || "Produto") + " · " + (prop?.name || "") + " · " + qtyText + " · " + monthLabel(item.date),
  };
};
// Destaque para número de sacos
const SacosChip = ({ n, tone = "green" }) => (
  <span style={{ display: "inline-block", fontWeight: 700, fontSize: 14, padding: "1px 8px", borderRadius: 12, whiteSpace: "nowrap",
    background: tone === "amber" ? COLORS.amberLight : COLORS.greenLight, color: tone === "amber" ? COLORS.amber : COLORS.green }}>{n + " sacos"}</span>
);
// ── Estoque por propriedade ─────────────────────────────────────
// p.stockByProp = { "<id da propriedade>": qtd, none: qtd }  ("none" = Não alocado / estoque geral)
// p.stock continua sendo o TOTAL (soma), usado em alertas e relatórios.
// Produtos antigos (sem stockByProp) têm todo o saldo em "Não alocado".
const NONE = "none";
const bucketKey = (propId) => (propId == null || propId === "" || propId === NONE ? NONE : String(propId));
const sbp = (p) => (p && p.stockByProp ? { ...p.stockByProp } : { [NONE]: num(p?.stock) });
const stockAt = (p, propId) => num(sbp(p)[bucketKey(propId)]);
const withSbp = (p, map) => {
  const clean = {};
  Object.keys(map).forEach(k => { const v = round2(num(map[k])); if (v > 0) clean[k] = v; });
  return { ...p, stockByProp: clean, stock: round2(Object.values(clean).reduce((t, v) => t + v, 0)) };
};
const addStock = (p, propId, delta) => { const m = sbp(p); const k = bucketKey(propId); m[k] = Math.max(0, num(m[k]) + num(delta)); return withSbp(p, m); };
// Aplicação: tira primeiro da propriedade; se faltar, completa com o "Não alocado"
const takeForApp = (p, propId, qty) => {
  const m = sbp(p); const k = bucketKey(propId);
  let rest = num(qty); const fromProp = Math.min(num(m[k]), rest); rest -= fromProp;
  const fromNone = k === NONE ? 0 : Math.min(num(m[NONE]), rest);
  m[k] = num(m[k]) - fromProp; if (k !== NONE) m[NONE] = num(m[NONE]) - fromNone;
  const takenFrom = {}; if (fromProp > 0) takenFrom[k] = round2(fromProp); if (fromNone > 0) takenFrom[NONE] = round2(fromNone);
  return { p: withSbp(p, m), takenFrom };
};
// Devolve ao estoque de onde saiu (aplicações antigas, sem registro, voltam para "Não alocado")
const giveBack = (p, app) => {
  const m = sbp(p);
  const tf = app.takenFrom && Object.keys(app.takenFrom).length ? app.takenFrom : { [NONE]: num(app.qty) };
  Object.keys(tf).forEach(k => { m[k] = num(m[k]) + num(tf[k]); });
  return withSbp(p, m);
};
const bucketName = (k, properties) => k === NONE ? "Não alocado" : (properties.find(pr => String(pr.id) === String(k))?.name || "Propriedade removida");
const fmtQty = (p, q) => round2(q) + " " + (p?.unit || "") + (isAdubo(p?.type) && p?.bagWeight ? " (" + fmtSacos(num(q) / p.bagWeight) + " sacos)" : "");
const byName = (a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" });
// Aplicação sem data válida (registros antigos)
const hasDate = (a) => !!a.date && !isNaN(new Date(a.date + "T12:00").getTime());
// Mês de referência no cronograma (adubos): "AAAA-MM". Sem ele, vale o mês da data da aplicação.
const monthKey = (y, m) => y + "-" + String(m + 1).padStart(2, "0");
const currentRefKey = () => { const n = new Date(); return monthKey(n.getFullYear(), n.getMonth()); };
const refKey = (a) => a.refMonth || (hasDate(a) ? a.date.slice(0, 7) : null);
const refLabel = (k) => { if (!k) return ""; const [y, m] = k.split("-"); return MONTHS[Number(m) - 1] + "/" + y; };
// A aplicação está no cronograma daquele produto/propriedade no mês de referência?
const inSchedule = (schedules, a) => { const k = refKey(a); return !!k && (schedules || []).some(s => String(s.productId) === String(a.productId) && String(s.propertyId) === String(a.propertyId) && (s.months || []).includes(Number(k.slice(5)))); };
// Formata número de sacos: inteiro sem casas, fracionado com 1 casa (ex.: 64 ou 12,5)
const fmtSacos = (n) => Number.isInteger(round2(n)) ? String(round2(n)) : n.toFixed(1).replace(".", ",");
// Quantidade planejada por mês: usa a quantidade informada no cronograma; se não houver, dose/ha × área
const plannedQty = (s, prod, area) => s?.qty ? Number(s.qty) : (prod?.dosePerHa || 0) * (area || 0);
// Sacos = quilos ÷ peso da sacaria (arredonda para cima)
const sacosFor = (prod, qty) => isAdubo(prod?.type) && prod?.bagWeight && qty ? Math.ceil(Number(qty) / prod.bagWeight) : null;

// ── Período Jul/2026 a Jul/2027 ───────────────────────────────────
const APP_MONTHS = [
  { label: "Jul/2026", month: 6, year: 2026 },
  { label: "Ago/2026", month: 7, year: 2026 },
  { label: "Set/2026", month: 8, year: 2026 },
  { label: "Out/2026", month: 9, year: 2026 },
  { label: "Nov/2026", month: 10, year: 2026 },
  { label: "Dez/2026", month: 11, year: 2026 },
  { label: "Jan/2027", month: 0, year: 2027 },
  { label: "Fev/2027", month: 1, year: 2027 },
  { label: "Mar/2027", month: 2, year: 2027 },
  { label: "Abr/2027", month: 3, year: 2027 },
  { label: "Mai/2027", month: 4, year: 2027 },
  { label: "Jun/2027", month: 5, year: 2027 },
  { label: "Jul/2027", month: 6, year: 2027 },
];
// Meses para programar aplicações: Ago/2026 a Jul/2027 (grava o nº do mês 1–12, compatível com dados antigos)
const SCHED_MONTHS = APP_MONTHS.slice(1);

const typeColor = (t) => {
  if (t === "Adubo") return { bg: COLORS.greenLight, text: COLORS.green };
  if (t?.includes("Fungicida")) return { bg: COLORS.blueLight, text: COLORS.blue };
  if (t?.includes("Inseticida")) return { bg: "#FBEAF0", text: "#993556" };
  if (t?.includes("Herbicida")) return { bg: COLORS.amberLight, text: COLORS.amber };
  if (t?.includes("Adjuvante")) return { bg: "#EEEDFE", text: "#534AB7" };
  if (t?.includes("Biológico")) return { bg: "#EEF5DD", text: "#4F6B12" };
  if (t?.includes("Cola")) return { bg: "#F3EDE6", text: "#7A5B3A" };
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

// ── Sincronização segura entre aparelhos ─────────────────────────
// Cada aparelho guarda a "base" (última versão confirmada do Firebase). Ao salvar, calcula só o que
// mudou em relação à base (incluído, alterado, excluído) e aplica essas mudanças sobre a versão ATUAL
// do Firebase. Assim um celular não apaga o que outro registrou.
const COLS = ["properties", "products", "schedules", "applications", "purchases", "notifications"];
const EMPTY_DATA = { properties: [], products: [], schedules: [], applications: [], purchases: [], notifications: [] };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byIdMap = (arr) => { const m = new Map(); (arr || []).forEach(x => m.set(String(x.id), x)); return m; };
// Produto alterado: campos comuns ficam com a versão deste aparelho; estoque é somado como DIFERENÇA
// (ex.: aplicação de 100 kg aqui e compra de 500 kg em outro aparelho = as duas valem)
const mergeProduct = (remote, base, local) => {
  const out = { ...remote };
  Object.keys(local).forEach(k => { if (!["stock", "stockByProp", "moves"].includes(k) && !same(local[k], base[k])) out[k] = local[k]; });
  const rs = sbp(remote), bs = sbp(base), ls = sbp(local);
  const keys = new Set([...Object.keys(rs), ...Object.keys(bs), ...Object.keys(ls)]);
  const m = {}; keys.forEach(k => { m[k] = num(rs[k]) + num(ls[k]) - num(bs[k]); });
  const baseMv = byIdMap(base.moves), localMv = byIdMap(local.moves);
  const moves = (remote.moves || []).filter(mv => !(baseMv.has(String(mv.id)) && !localMv.has(String(mv.id))));
  const have = new Set(moves.map(mv => String(mv.id)));
  (local.moves || []).forEach(mv => { if (!baseMv.has(String(mv.id)) && !have.has(String(mv.id))) moves.push(mv); });
  return { ...withSbp(out, m), moves };
};
// Notificação alterada: junta quem já leu nos dois aparelhos
const mergeNotif = (remote, base, local) => ({ ...remote, ...local, readBy: [...new Set([...(remote.readBy || []), ...(local.readBy || [])].map(String))] });
// Aplica sobre "target" as mudanças que levaram de "base" a "local"
const applyDiff = (target, base, local) => {
  const out = { ...EMPTY_DATA, ...target };
  COLS.forEach(col => {
    const bMap = byIdMap(base?.[col]), lMap = byIdMap(local?.[col]);
    let arr = (target?.[col] || []).filter(x => !(bMap.has(String(x.id)) && !lMap.has(String(x.id))));
    (local?.[col] || []).forEach(item => {
      const id = String(item.id), b = bMap.get(id);
      if (b && same(b, item)) return; // não mudou neste aparelho
      const i = arr.findIndex(x => String(x.id) === id);
      if (i < 0) { if (!b) arr.push(item); return; } // excluído em outro aparelho e alterado aqui: mantém excluído
      if (b && col === "products") arr[i] = mergeProduct(arr[i], b, item);
      else if (b && col === "notifications") arr[i] = mergeNotif(arr[i], b, item);
      else arr[i] = item;
    });
    out[col] = arr;
  });
  return out;
};

// ── Cópia local (modo offline) ───────────────────────────────────
// Guarda neste aparelho a última versão do Firebase (base), o que foi feito aqui (local) e a lista de usuários,
// para abrir e registrar sem internet. Quando a conexão volta, envia só as diferenças (applyDiff).
const LS_KEY = "agrogestao_offline_v1";
const readLS = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch { return null; } };
const writeLS = (v) => { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch (e) { console.warn("Sem espaço para a cópia local", e); } };

const initData = {
  properties: [
    { id: 1, name: "Fazenda Santa Rosa", area: 45, location: "Rolim de Moura - RO" },
    { id: 2, name: "Sítio Boa Esperança", area: 18, location: "Ji-Paraná - RO" },
  ],
  products: [
    { id: 1, name: "NPK 20-05-20", type: "Adubo", unit: "kg", dosePerHa: 120, bagWeight: 50, stock: 3200, price: 4.5 },
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
    { id: 1, productId: 1, propertyId: 1, date: "2026-07-15", areaApplied: 45, qty: 5400, notes: "Concluída" },
    { id: 2, productId: 4, propertyId: 1, date: "2026-07-20", areaApplied: 45, qty: 67.5, notes: "Concluída" },
    { id: 3, productId: 2, propertyId: 1, date: "2026-08-10", areaApplied: 45, qty: 36, notes: "Concluída" },
    { id: 4, productId: 3, propertyId: 2, date: "2026-09-05", areaApplied: 18, qty: 9, notes: "Concluída" },
  ],
  purchases: [
    { id: 1, productId: 1, date: "2026-07-05", qty: 5000, totalCost: 22500 },
    { id: 2, productId: 2, date: "2026-07-10", qty: 50, totalCost: 4250 },
    { id: 3, productId: 3, date: "2026-08-15", qty: 30, totalCost: 3600 },
  ],
  notifications: [
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

const StockCard = ({ p, properties, applications = [], purchases = [], onEdit, onDelete }) => {
  const pu = unitPrice(p, purchases);
  const hasBuy = purchases.some(c => String(c.productId) === String(p.id));
  const ref = isAdubo(p.type) ? (p.bagWeight || 1) : 1;
  const maxM = Math.max(...properties.map(pr => p.dosePerHa * pr.area), 1);
  const mLeft = Math.floor(p.stock / maxM);
  // Barra de consumo: vazia sem aplicações, 100% verde quando o estoque acaba
  const stockNow = Number(p.stock) || 0;
  const consumed = applications.filter(a => a.productId === p.id).reduce((s, a) => s + (Number(a.qty) || 0), 0);
  const pct = stockNow <= 0 ? (consumed > 0 ? 100 : 0) : Math.min(100, (consumed / (consumed + stockNow)) * 100);
  const bar = mLeft < 1 ? COLORS.red : mLeft < 3 ? COLORS.amber : COLORS.greenMid;
  return (
    <Card style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <div><p style={{ fontWeight: 500, margin: "0 0 4px", fontSize: 14 }}>{isDefensivo(p.type) && p.activeIngredient && <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>{p.activeIngredient + " · "}</span>}{p.name}</p><Badge label={p.type} type={p.type} /></div>
        <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <p style={{ fontWeight: 500, margin: 0, fontSize: 16, color: bar }}>{p.stock} {p.unit}</p>
          <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>{isAdubo(p.type) && p.bagWeight ? fmtSacos(stockNow / p.bagWeight) + " sacos" : "~" + mLeft + " meses"}</p>
          <div style={{ display: "flex", gap: 6 }}>
            {onEdit && <button onClick={onEdit} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer" }}>✏️</button>}
            {onDelete && <button onClick={onDelete} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer", color: COLORS.red }}>🗑</button>}
          </div>
        </div>
      </div>
      {(() => {
        // Saldo por propriedade (só as que o usuário enxerga) + Não alocado
        const rows = [...properties.map(pr => ({ k: String(pr.id), name: pr.name })), { k: NONE, name: "Não alocado" }]
          .map(r => ({ ...r, q: stockAt(p, r.k) })).filter(r => r.q > 0);
        return (
          <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "6px 10px", margin: "0 0 8px" }}>
            {rows.length === 0
              ? <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>Sem saldo nas propriedades</p>
              : rows.map(r => (
                <div key={r.k} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "2px 0" }}>
                  <span style={{ color: r.k === NONE ? COLORS.amber : "var(--color-text-secondary)" }}>{r.name}</span>
                  <strong style={{ whiteSpace: "nowrap" }}>{fmtQty(p, r.q)}</strong>
                </div>
              ))}
          </div>
        );
      })()}
      <div style={{ background: "var(--color-background-secondary)", borderRadius: 4, height: 6 }}>
        <div style={{ width: pct + "%", background: COLORS.green, height: "100%", borderRadius: 4, transition: "width 0.3s" }} />
      </div>
      <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "4px 0 0" }}>
        {"Consumido: " + pct.toFixed(0) + "% (" + round2(consumed) + " " + p.unit + (isAdubo(p.type) && p.bagWeight ? " · " + fmtSacos(consumed / p.bagWeight) + " sacos" : "") + " aplicados)"}
      </p>
      <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "2px 0 0" }}>
        {isAdubo(p.type)
          ? "Sacaria: " + (p.bagWeight || "?") + " kg · " + brl(pu) + "/" + p.unit + (p.bagWeight ? " · " + brl(pu * p.bagWeight) + "/saco" : "") + (num(p.dosePerHa) > 0 ? " · " + brl(pu * p.dosePerHa) + "/ha" : "")
          : p.dosePerHa + " " + p.unit + "/ha · " + brl(pu) + "/" + p.unit + " · " + brl(pu * num(p.dosePerHa)) + "/ha"}
        {!hasBuy && <span style={{ color: COLORS.amber }}>{" · sem compras"}</span>}
      </p>
    </Card>
  );
};

const NotifItem = ({ n, onRead }) => (
  <div style={{ padding: "8px 0", borderBottom: onRead ? "0.5px solid var(--color-border-tertiary)" : "none", fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start" }}>
    <span>✅</span>
    <div style={{ flex: 1 }}>
      {n.type === "application" ? (
        <>
          <p style={{ margin: 0, fontWeight: 500 }}>{n.productName}</p>
          <p style={{ margin: "2px 0 0", color: "var(--color-text-secondary)", fontSize: 12 }}>{n.propertyName + " · " + n.qtyText + " · " + n.month}</p>
          {(n.at || n.by) && <p style={{ margin: "2px 0 0", color: "var(--color-text-secondary)", fontSize: 11 }}>{"Registrado" + (n.by ? " por " + n.by : "") + (n.at ? " em " + new Date(n.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "")}</p>}
        </>
      ) : <p style={{ margin: 0 }}>{n.msg}</p>}
    </div>
    {onRead && <button onClick={onRead} title="Marcar como lida" style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer", color: COLORS.green }}>✓ Lida</button>}
  </div>
);

// Troca de senha do próprio usuário (confere a senha atual antes de gravar)
const PasswordModal = ({ user, onSave, onClose }) => {
  const [f, setF] = useState({ cur: "", nova: "", conf: "" });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const field = (label, key) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 13, color: "#fff", fontWeight: 700, display: "block", marginBottom: 6 }}>{label}</label>
      <input type="password" value={f[key]} onChange={e => { setF({ ...f, [key]: e.target.value }); setErr(""); }} autoComplete={key === "cur" ? "current-password" : "new-password"}
        style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, fontSize: 14, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff" }} />
    </div>
  );
  const submit = () => {
    if (hashPassword(f.cur) !== user.password) return setErr("Senha atual incorreta.");
    if (f.nova.length < 4) return setErr("A nova senha precisa ter pelo menos 4 caracteres.");
    if (f.nova !== f.conf) return setErr("A confirmação não confere com a nova senha.");
    if (f.nova === f.cur) return setErr("A nova senha é igual à atual.");
    Promise.resolve(onSave(hashPassword(f.nova))).then(ok => ok === false ? setErr("Sem conexão: a senha não foi alterada. Tente de novo com internet.") : setOk(true));
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 150, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: COLORS.green, borderRadius: "20px 20px 0 0", padding: "1.5rem 1.25rem 2rem", width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ fontWeight: 500, fontSize: 17, margin: 0, color: "#fff" }}>Alterar senha</p>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", width: 32, height: 32, fontSize: 16, cursor: "pointer", color: "#fff" }}>✕</button>
        </div>
        {ok ? (
          <>
            <p style={{ color: "#fff", fontSize: 14, margin: "0 0 16px" }}>✅ Senha alterada. Use a nova senha no próximo login.</p>
            <button onClick={onClose} style={{ width: "100%", background: "#fff", color: COLORS.green, border: "none", borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Fechar</button>
          </>
        ) : (
          <>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, margin: "0 0 12px" }}>{"Usuário: " + user.username}</p>
            {field("Senha atual", "cur")}
            {field("Nova senha", "nova")}
            {field("Confirmar nova senha", "conf")}
            {err && <p style={{ background: "rgba(163,45,45,0.4)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#fff", margin: "0 0 12px" }}>{"⚠️ " + err}</p>}
            <button onClick={submit} style={{ width: "100%", background: "#fff", color: COLORS.green, border: "none", borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Salvar nova senha</button>
          </>
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState(initData);
  const baseRef = useRef(null);      // última versão confirmada no Firebase
  const dataRef = useRef(initData);  // versão atual na tela
  dataRef.current = data;
  const syncingRef = useRef(false);
  const againRef = useRef(false);
  const retryRef = useRef(null);
  const [syncPending, setSyncPending] = useState(false);
  const [offline, setOffline] = useState(false); // abriu com a cópia local, sem conseguir ler o Firebase
  const [loading, setLoading] = useState(true);
  const [selectedProp, setSelectedProp] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [notifOpen, setNotifOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [stockFilter, setStockFilter] = useState("defensivo");
  const [defTypeFilter, setDefTypeFilter] = useState("");
  const [appFilter, setAppFilter] = useState("defensivo");
  const [appPropFilter, setAppPropFilter] = useState(0);
  const [appMonthIdx, setAppMonthIdx] = useState(currentAppMonthIdx);
  const [cronoFilter, setCronoFilter] = useState("defensivo");
  const [calMonthIdx, setCalMonthIdx] = useState(() => {
    const n = new Date();
    const i = SCHED_MONTHS.findIndex(m => m.month === n.getMonth() && m.year === n.getFullYear());
    return i < 0 ? 0 : i;
  });
  const [loadFailed, setLoadFailed] = useState(false);
  const [purchaseTypeFilter, setPurchaseTypeFilter] = useState("");

  // Auth
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        // loadData/loadUsers LANÇAM erro se a leitura falhar (cai no catch abaixo e nada é gravado).
        // null = documento ainda não existe (primeira instalação).
        const [saved, savedUsers] = await Promise.all([loadData(), loadUsers()]);
        const st = readLS();
        if (saved) {
          baseRef.current = saved;
          // Registros feitos sem internet e ainda não enviados: reaplica sobre a versão atual do Firebase
          const hasPending = st && st.base && st.local && !same(st.base, st.local);
          setData(hasPending ? applyDiff(saved, st.base, st.local) : saved);
        } else { baseRef.current = EMPTY_DATA; }
        if (Array.isArray(savedUsers) && savedUsers.length > 0) {
          setUsers(savedUsers);
        } else if (savedUsers === null) {
          // Primeira instalação: cria o usuário master padrão no Firebase
          const defaults = DEFAULT_USERS.map(u => ({ ...u, password: hashPassword(u.password) }));
          await saveUsers(defaults);
          setUsers(defaults);
        } else {
          throw new Error("Lista de usuários vazia no Firebase");
        }
      } catch (err) {
        // Proteção: se não conseguiu ler o Firebase, NÃO grava nada por cima.
        // Se houver cópia local neste aparelho, abre em modo offline com ela.
        console.error("Erro ao carregar dados:", err);
        const st = readLS();
        if (st && st.base && Array.isArray(st.users) && st.users.length) {
          baseRef.current = st.base;
          setData(st.local && !same(st.local, st.base) ? st.local : st.base);
          setUsers(st.users);
          setOffline(true);
        } else {
          setLoadFailed(true);
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  // Mantém a cópia local deste aparelho sempre atualizada
  useEffect(() => {
    if (loading || loadFailed || !baseRef.current) return;
    writeLS({ base: baseRef.current, local: data, users, at: new Date().toISOString() });
  }, [data, users, loading]);

  // Internet voltou: envia o que estiver pendente
  useEffect(() => {
    const onOnline = () => { if (dataRef.current !== baseRef.current) syncData(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  useEffect(() => {
    // Salva só o que mudou neste aparelho (ver applyDiff), com uma pequena espera para juntar cliques
    if (loading || loadFailed || !currentUser || data === baseRef.current) return;
    const t = setTimeout(() => syncData(), 400);
    return () => clearTimeout(t);
  }, [data, currentUser]);

  const syncData = async () => {
    if (syncingRef.current) { againRef.current = true; return; }
    const base = baseRef.current, local = dataRef.current;
    if (!base || local === base) return;
    syncingRef.current = true;
    try {
      const merged = await updateData(remote => applyDiff(remote, base, local));
      const cur = dataRef.current;
      baseRef.current = merged;
      // Se a pessoa mexeu em algo enquanto salvava, reaplica essas mudanças sobre a versão salva
      setData(cur === local ? merged : applyDiff(merged, local, cur));
      setSyncPending(false);
      setOffline(false);
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    } catch (e) {
      console.error("Erro ao salvar dados:", e);
      setSyncPending(true);
      if (!retryRef.current) retryRef.current = setTimeout(() => { retryRef.current = null; syncData(); }, 15000);
    } finally {
      syncingRef.current = false;
      if (againRef.current) { againRef.current = false; syncData(); }
    }
  };

  // Recebe em tempo real o que outros aparelhos gravaram
  useEffect(() => {
    if (loading || loadFailed) return;
    let unsub = () => {};
    try {
      unsub = subscribeData(remote => {
        if (syncingRef.current) return; // a gravação em andamento já traz a versão nova
        setOffline(false);
        const base = baseRef.current, local = dataRef.current;
        if (same(remote, base)) return;
        baseRef.current = remote;
        setData(local === base ? remote : applyDiff(remote, base, local));
      }, err => console.error("Erro na sincronização:", err));
    } catch (e) { console.error(e); }
    return () => unsub();
  }, [loading, loadFailed]);

  // Usuários NÃO são mais salvos automaticamente a cada mudança da lista.
  // Toda alteração passa por changeUsers, que aplica só a diferença sobre a lista atual do Firebase.
  const changeUsers = async (newList) => {
    const prev = users;
    const prevIds = new Set(prev.map(u => String(u.id)));
    const nextIds = new Set(newList.map(u => String(u.id)));
    const removed = prev.filter(u => !nextIds.has(String(u.id))).map(u => String(u.id));
    const changed = newList.filter(u => { const o = prev.find(x => String(x.id) === String(u.id)); return !o || JSON.stringify(o) !== JSON.stringify(u); });
    try {
      const saved = await updateUsers(current => {
        let list = current.filter(u => !removed.includes(String(u.id)));
        changed.forEach(u => {
          const i = list.findIndex(x => String(x.id) === String(u.id));
          if (i >= 0) list[i] = u; else list.push(u);
        });
        return list;
      });
      setUsers(saved);
      return true;
    } catch (e) {
      console.error("Erro ao salvar usuários:", e);
      alert("Não foi possível salvar a alteração de usuários. Verifique a internet e tente de novo. Nada foi alterado.");
      return false;
    }
  };

  const handleLogin = async (username, password) => {
    let user = authenticate(users, username, password);
    if (!user) {
      // Usuário pode ter sido criado em outro aparelho depois que este app abriu: recarrega a lista
      try { const fresh = await loadUsers(); if (Array.isArray(fresh) && fresh.length) { setUsers(fresh); user = authenticate(fresh, username, password); } } catch (e) { /* sem internet: mantém a lista atual */ }
    }
    if (user) { setCurrentUser(user); setLoginError(""); }
    else setLoginError("Usuário ou senha incorretos.");
  };

  const handleLogout = () => { setCurrentUser(null); setTab("dashboard"); };

  const visibleProperties = currentUser ? filterPropertiesByUser(data.properties, currentUser) : [];

  if (loadFailed) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24, textAlign: "center", gap: 12 }}>
      <p style={{ fontSize: 16, fontWeight: 500 }}>Não foi possível carregar os dados.</p>
      <p style={{ fontSize: 14, opacity: 0.7 }}>Verifique a internet e tente de novo. Nenhum dado foi alterado.</p>
      <button onClick={() => window.location.reload()} style={{ fontSize: 14, background: COLORS.green, color: "#fff", border: "none", borderRadius: 20, padding: "8px 18px", cursor: "pointer" }}>Tentar novamente</button>
    </div>
  );

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#3B6D11", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 40 }}>🌿</div>
      <p style={{ fontSize: 16 }}>Carregando AgroGestão...</p>
    </div>
  );

  if (!currentUser) return <LoginScreen onLogin={handleLogin} error={loginError} />;

  // ── Acesso por propriedade ─────────────────────────────────────
  // Master vê tudo; Operador/Leitura veem só as propriedades liberadas no cadastro do usuário
  const isMaster = currentUser.role === "master";
  const isOperador = currentUser.role === "operador";
  // Estoque: só o Master cadastra/edita; Operador e Leitura apenas visualizam
  const stockRO = !isMaster;
  // Perfil Leitura: só visualiza (sem registrar, editar ou excluir em nenhuma aba)
  const isLeitura = currentUser.role === "leitura";
  // Relatórios (com download): Master e Leitura
  const canSeeReports = isMaster || currentUser.role === "leitura";
  const allowedIds = (() => {
    let pr = currentUser.properties;
    if (typeof pr === "string" && pr !== "all") { try { pr = JSON.parse(pr); } catch { pr = []; } }
    return isMaster || pr === "all" ? null : new Set((pr || []).map(String));
  })();
  const canSeeProp = (id) => !allowedIds || allowedIds.has(String(id));
  const vd = allowedIds ? {
    ...data,
    properties: data.properties.filter(p => canSeeProp(p.id)),
    schedules: data.schedules.filter(s => canSeeProp(s.propertyId)),
    applications: data.applications.filter(a => canSeeProp(a.propertyId)),
  } : data;
  const curProp = vd.properties.some(p => p.id === selectedProp) ? selectedProp : vd.properties[0]?.id;
  // Cronograma: separa programações de defensivos e de adubos
  const cronoMatch = (s) => { const pr = data.products.find(p => p.id === s.productId); return cronoFilter === "defensivo" ? isDefensivo(pr?.type) : isAdubo(pr?.type); };

  // Notificações: só de aplicações; lidas vão para a aba Histórico (leitura é por usuário)
  const isRead = (n) => n.read === true || (n.readBy || []).map(String).includes(String(currentUser.id));
  const notifVisible = data.notifications.filter(n => (n.type === "application" || n.type === "done") && (n.propertyId == null ? isMaster : canSeeProp(n.propertyId)));
  const byNewest = (a, b) => (b.at || "").localeCompare(a.at || "") || (b.id - a.id);
  const unreadList = notifVisible.filter(n => !isRead(n)).sort(byNewest);
  const readList = notifVisible.filter(isRead).sort(byNewest);
  const unread = unreadList.length;
  const markRead = (ids) => setData(d => ({ ...d, notifications: d.notifications.map(n => ids.includes(n.id) ? { ...n, readBy: [...new Set([...(n.readBy || []).map(String), String(currentUser.id)])] } : n) }));
  const markAllRead = () => { markRead(unreadList.map(n => n.id)); setNotifOpen(false); };

  const appCost = (a) => {
    const prod = data.products.find(p => p.id === a.productId);
    return unitPrice(prod, data.purchases) * num(a.qty);
  };
  const propCost = (propId) => vd.applications.filter(a => a.propertyId === propId).reduce((s, a) => s + appCost(a), 0);

  // ── Planejado vs Realizado ────────────────────────────────────────
  const appliedQtyForSchedule = (s, monthIdx) => {
    return vd.applications
      .filter(a => a.productId === s.productId && a.propertyId === s.propertyId && refKey(a) && Number(refKey(a).slice(5)) - 1 === monthIdx)
      .reduce((sum, a) => sum + Number(a.qty), 0);
  };

  const scheduleCompletionPct = (s, monthIdx) => {
    const prod = data.products.find(p => p.id === s.productId);
    const prop = vd.properties.find(p => p.id === s.propertyId);
    const planned = plannedQty(s, prod, prop?.area);
    if (planned === 0) return 0;
    const applied = appliedQtyForSchedule(s, monthIdx);
    return Math.min(100, (applied / planned) * 100);
  };

  const save = (type, item) => {
    if (isLeitura) { setModal(null); return; }
    setData(d => {
      const key = { application:"applications", purchase:"purchases", product:"products", schedule:"schedules", property:"properties" }[type];
      const arr = d[key];
      const idx = arr.findIndex(x => x.id === item.id);
      if (type === "application") {
        let products = d.products;
        // Edição: devolve primeiro o que a versão antiga tinha tirado
        const old = idx === -1 ? null : arr[idx];
        if (old) products = products.map(p => p.id === old.productId ? giveBack(p, old) : p);
        let takenFrom = {};
        products = products.map(p => { if (p.id !== item.productId) return p; const r = takeForApp(p, item.propertyId, item.qty); takenFrom = r.takenFrom; return r.p; });
        const it2 = { ...item, takenFrom };
        if (!old) return { ...d, applications: [...arr, it2], products, notifications: [...d.notifications, buildAppNotif(it2, d, currentUser)] };
        return { ...d, applications: arr.map(x => x.id === item.id ? it2 : x), products };
      }
      if (type === "purchase") {
        // Compra entra no estoque da propriedade de destino (ou "Não alocado")
        let products = d.products;
        const old = idx === -1 ? null : arr[idx];
        if (old) products = products.map(p => p.id === old.productId ? addStock(p, old.propertyId, -num(old.qty)) : p);
        products = products.map(p => p.id === item.productId ? addStock(p, item.propertyId, num(item.qty)) : p);
        return { ...d, purchases: old ? arr.map(x => x.id === item.id ? item : x) : [...arr, item], products };
      }
      return { ...d, [key]: idx === -1 ? [...arr, item] : arr.map(x => x.id === item.id ? item : x) };
    });
    setModal(null);
  };

  // Transferência entre propriedades (fica registrada no próprio produto, em p.moves)
  const saveTransfer = (t) => {
    if (!isMaster) { setModal(null); return; }
    setData(d => ({ ...d, products: d.products.map(p => {
      if (p.id !== t.productId) return p;
      const m = sbp(p); const from = bucketKey(t.from), to = bucketKey(t.to);
      const q = Math.min(num(t.qty), num(m[from]));
      if (!(q > 0) || from === to) return p;
      m[from] = num(m[from]) - q; m[to] = num(m[to]) + q;
      const mv = { id: Date.now(), date: t.date, from, to, qty: round2(q), notes: t.notes || "", by: currentUser.name, at: new Date().toISOString() };
      return { ...withSbp(p, m), moves: [...(p.moves || []), mv] };
    }) }));
    setModal(null);
  };

  const del = (type, id) => {
    if (isLeitura) { setConfirm(null); return; }
    const key = { application:"applications", purchase:"purchases", product:"products", schedule:"schedules", property:"properties" }[type];
    if (type === "application") {
      // Excluir aplicação: devolve a quantidade ao estoque do produto
      setData(d => {
        const app = d.applications.find(a => String(a.id) === String(id));
        if (!app) return d;
        return { ...d,
          applications: d.applications.filter(a => String(a.id) !== String(id)),
          products: d.products.map(p => String(p.id) === String(app.productId) ? giveBack(p, app) : p) };
      });
      setConfirm(null);
      return;
    }
    if (type === "purchase") {
      // Excluir compra: retira a quantidade do estoque
      setData(d => {
        const pu = d.purchases.find(x => String(x.id) === String(id));
        if (!pu) return d;
        return { ...d,
          purchases: d.purchases.filter(x => String(x.id) !== String(id)),
          products: d.products.map(p => String(p.id) === String(pu.productId) ? addStock(p, pu.propertyId, -num(pu.qty)) : p) };
      });
      setConfirm(null);
      return;
    }
    if (type === "transfer") {
      // Desfazer transferência: devolve à origem (só se o destino ainda tiver a quantidade)
      setData(d => ({ ...d, products: d.products.map(p => {
        if (String(p.id) !== String(id.productId)) return p;
        const mv = (p.moves || []).find(x => x.id === id.moveId);
        if (!mv || stockAt(p, mv.to) < num(mv.qty)) return p;
        const m = sbp(p); m[mv.to] = num(m[mv.to]) - num(mv.qty); m[mv.from] = num(m[mv.from]) + num(mv.qty);
        return { ...withSbp(p, m), moves: p.moves.filter(x => x.id !== mv.id) };
      }) }));
      setConfirm(null);
      return;
    }
    setData(d => ({ ...d, [key]: d[key].filter(x => x.id !== id) }));
    setConfirm(null);
  };

  const exportCSV = () => {
    const rows = [["Data","Propriedade","Produto","Tipo","Área (ha)","Qtd","Unidade","Sacos","Custo (R$)","Obs"]];
    vd.applications.forEach(a => {
      const prod = data.products.find(p => p.id === a.productId);
      const pr = vd.properties.find(p => p.id === a.propertyId);
      const sacos = isAdubo(prod?.type) && prod?.bagWeight ? Math.ceil(a.qty / prod.bagWeight) : "";
      rows.push([a.date, pr?.name, prod?.name, prod?.type, a.areaApplied, a.qty, prod?.unit, sacos, appCost(a).toFixed(2), a.notes]);
    });
    const blob = new Blob(["﻿" + rows.map(r => r.join(";")).join("\n")], { type: "text/csv;charset=utf-8;" });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = "agro_gestao.csv"; el.click();
  };

  const exportTxt = () => {
    let txt = "RELATÓRIO AGROGESTÃO CAFÉ\n" + "=".repeat(40) + "\n\n";
    vd.properties.forEach(p => {
      txt += "PROPRIEDADE: " + p.name + " — " + p.area + " ha\n";
      let total = 0;
      vd.applications.filter(a => a.propertyId === p.id).forEach(a => {
        const prod = data.products.find(pr => pr.id === a.productId);
        const c = appCost(a); total += c;
        const sacos = isAdubo(prod?.type) && prod?.bagWeight ? " | Sacos: " + Math.ceil(a.qty / prod.bagWeight) : "";
        txt += "  " + a.date + " | " + prod?.name + " | " + a.qty + " " + prod?.unit + sacos + " | R$ " + c.toFixed(2) + "\n";
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
    { id: "history",   icon: "🕘", label: "Histórico" },
    { id: "users",     icon: "👥", label: "Usuários", masterOnly: true },
  ];

  const propSel = vd.properties.find(p => p.id === curProp);

  return (
    <div style={{ fontFamily: "var(--font-sans)", maxWidth: 420, margin: "0 auto", paddingBottom: 84 }}>
      {(syncPending || offline) && (
        <div style={{ background: COLORS.amberLight, color: COLORS.amber, fontSize: 12, fontWeight: 500, padding: "6px 12px", textAlign: "center" }}>
          {"📴 Modo offline: " + (data !== baseRef.current ? "há registros guardados neste celular, que serão enviados" : "os registros ficam guardados neste celular e são enviados") + " automaticamente quando a internet voltar."}
        </div>
      )}
      <div style={{ background: COLORS.green, color: "#fff", padding: "1rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>🌿 AgroGestão <span style={{ fontSize: 11, opacity: 0.8 }}>v1.23</span></div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{currentUser.name} · <span style={{ opacity: 0.75 }}>{currentUser.role}</span></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setNotifOpen(!notifOpen)} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 20, padding: "6px 12px", color: "#fff", cursor: "pointer", fontSize: 14, position: "relative" }}>
            🔔{unread > 0 && <span style={{ background: COLORS.red, color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 5px", position: "absolute", top: 2, right: 2 }}>{unread}</span>}
          </button>
          <button onClick={() => setPwOpen(true)} title="Alterar senha" style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 20, padding: "6px 10px", color: "#fff", cursor: "pointer", fontSize: 14 }}>🔑</button>
          <button onClick={handleLogout} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 20, padding: "6px 12px", color: "#fff", cursor: "pointer", fontSize: 13 }}>Sair</button>
        </div>
      </div>

      {notifOpen && (
        <Card style={{ borderRadius: 0, borderLeft: "none", borderRight: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontWeight: 500, fontSize: 14 }}>Notificações</span>
            <button onClick={markAllRead} style={{ fontSize: 12, color: COLORS.green, background: "none", border: "none", cursor: "pointer" }}>Marcar lidas</button>
          </div>
          {unreadList.length === 0 && <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "4px 0" }}>Nenhuma notificação nova. As lidas ficam na aba 🕘 Histórico.</p>}
          {unreadList.map(n => <NotifItem key={n.id} n={n} onRead={() => markRead([n.id])} />)}
        </Card>
      )}

      <div style={{ padding: "1rem" }}>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 16, margin: 0 }}>Visão geral</p>
              {isMaster && <button onClick={() => setModal({ type: "property", item: {} })} style={{ fontSize: 13, background: COLORS.green, color: "#fff", border: "none", borderRadius: 20, padding: "5px 14px", cursor: "pointer" }}>+ Lavoura</button>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <MetricCard label="Propriedades" value={vd.properties.length} sub="cadastradas" />
              <MetricCard label="Produtos" value={data.products.length} sub="no portfólio" />
              <MetricCard label="Aplicações" value={vd.applications.length} sub="registradas" />
              <MetricCard label="Est. crítico" value={data.products.filter(p => p.stock < p.dosePerHa * 20).length} sub="produtos" color={COLORS.red} />
            </div>

            <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 8px" }}>{isMaster ? "Propriedades cadastradas" : "Sua propriedade"}</p>
            {vd.properties.map(p => (
              <Card key={p.id} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: COLORS.greenLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🌱</div>
                    <div>
                      <p style={{ fontWeight: 500, margin: "0 0 2px", fontSize: 14 }}>{p.name}</p>
                      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>{p.location + " · " + p.area + " ha"}</p>
                    </div>
                  </div>
                  {isMaster && <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setModal({ type: "property", item: { ...p } })} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer" }}>✏️</button>
                    <button onClick={() => setConfirm({ type: "property", id: p.id, label: p.name })} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer", color: COLORS.red }}>🗑</button>
                  </div>}
                </div>
              </Card>
            ))}

            <p style={{ fontWeight: 500, fontSize: 14, margin: "20px 0 8px" }}>Agenda do mês atual</p>
            {(() => {
              const curMonth = new Date().getMonth();
              const cur = curMonth + 1;
              const items = vd.schedules.filter(s => s.months.includes(cur));
              if (!items.length) return <p style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Nenhuma aplicação este mês.</p>;
              return items.map(s => {
                const prod = data.products.find(p => p.id === s.productId);
                const pr = vd.properties.find(p => p.id === s.propertyId);
                const semEstoque = (prod?.stock || 0) <= 0;
                const pct = scheduleCompletionPct(s, curMonth);
                const planned = plannedQty(s, prod, pr?.area);
                const applied = appliedQtyForSchedule(s, curMonth);
                const done = pct >= 100;
                const barColor = pct >= 100 ? COLORS.green : pct > 0 ? COLORS.amber : COLORS.grayLight;
                return (
                  <Card key={s.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <p style={{ fontWeight: 500, margin: "0 0 4px", fontSize: 14 }}>{prod?.name}</p>
                        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 6px" }}>{pr?.name}</p>
                        <Badge label={prod?.type} type={prod?.type} />
                      </div>
                      {done
                        ? <span style={{ fontSize: 12, color: COLORS.green, background: COLORS.greenLight, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>✓ 100%</span>
                        : semEstoque
                          ? <span style={{ fontSize: 12, color: COLORS.red, background: COLORS.redLight, padding: "4px 10px", borderRadius: 20 }}>Sem estoque</span>
                          : isLeitura ? null : <button onClick={() => setModal({ type: "application", item: { productId: s.productId, propertyId: s.propertyId, areaApplied: pr?.area, qty: ((planned - applied) > 0 ? (planned - applied).toFixed(1) : ""), date: new Date().toISOString().split("T")[0], refMonth: currentRefKey() } })} style={{ fontSize: 12, background: COLORS.green, color: "#fff", border: "none", borderRadius: 20, padding: "4px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>
                            {pct > 0 ? "Completar" : "Registrar"}
                          </button>}
                    </div>
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3 }}>
                        <span>Realizado: <strong style={{ color: pct >= 100 ? COLORS.green : pct > 0 ? COLORS.amber : "var(--color-text-secondary)" }}>{applied.toFixed(1)} {prod?.unit}</strong></span>
                        <span style={{ fontWeight: 600, color: barColor }}>{pct.toFixed(0)}%</span>
                      </div>
                      <div style={{ background: "var(--color-background-secondary)", borderRadius: 4, height: 6 }}>
                        <div style={{ width: pct + "%", background: barColor, height: "100%", borderRadius: 4, transition: "width 0.3s" }} />
                      </div>
                      <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "3px 0 0" }}>Planejado: {planned.toFixed(1)} {prod?.unit}</p>
                    </div>
                  </Card>
                );
              });
            })()}

            {(<>
            <p style={{ fontWeight: 500, fontSize: 14, margin: "20px 0 8px" }}>Estoque crítico</p>
            {data.products.filter(p => p.stock < p.dosePerHa * 20).map(p => (
              <Card key={p.id} style={{ marginBottom: 8, borderLeft: "3px solid " + (p.stock <= 0 ? COLORS.red : COLORS.amber), borderRadius: "0 12px 12px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ fontWeight: 500, margin: "0 0 2px", fontSize: 14 }}>{p.name}</p>
                    <p style={{ fontSize: 12, color: p.stock <= 0 ? COLORS.red : "var(--color-text-secondary)", margin: 0, fontWeight: p.stock <= 0 ? 600 : 400 }}>
                      {p.stock <= 0 ? "⚠️ Sem estoque" : p.stock + " " + p.unit + " em estoque"}
                    </p>
                  </div>
                  <Badge label={p.type} type={p.type} />
                </div>
              </Card>
            ))}
            {data.products.filter(p => p.stock < p.dosePerHa * 20).length === 0 && <p style={{ color: COLORS.green, fontSize: 13 }}>✓ Todos os estoques adequados</p>}
            </>)}
          </div>
        )}

        {/* CRONOGRAMA */}
        {tab === "calendar" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 16, margin: 0 }}>Cronograma</p>
              {!isLeitura && <button onClick={() => setModal({ type: "schedule", item: {} })} style={{ fontSize: 13, background: COLORS.green, color: "#fff", border: "none", borderRadius: 20, padding: "5px 14px", cursor: "pointer" }}>+ Programar</button>}
            </div>
            <select value={curProp} onChange={e => setSelectedProp(Number(e.target.value))} style={{ width: "100%", marginBottom: 12, padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", fontSize: 14 }}>
              {vd.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={calMonthIdx} onChange={e => setCalMonthIdx(Number(e.target.value))} style={{ width: "100%", marginBottom: 16, padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", fontSize: 14 }}>
              {SCHED_MONTHS.map((m, i) => {
                const has = vd.schedules.some(s => s.propertyId === curProp && s.months.includes(m.month + 1) && cronoMatch(s));
                return <option key={m.label} value={i}>{m.label + (has ? " •" : "")}</option>;
              })}
            </select>
            <PillTabs tabs={[{ id: "defensivo", label: "💊 Defensivos" }, { id: "adubo", label: "🌾 Adubos" }]} value={cronoFilter} onChange={setCronoFilter} />
            <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 8px" }}>{"Aplicações em " + SCHED_MONTHS[calMonthIdx].label}</p>
            {(() => {
              const area = propSel?.area || 1;
              const items = vd.schedules.filter(s => s.propertyId === curProp && s.months.includes(SCHED_MONTHS[calMonthIdx].month + 1) && cronoMatch(s));
              if (!items.length) return <p style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Nenhuma aplicação neste mês.</p>;
              return items.map(s => {
                const prod = data.products.find(p => p.id === s.productId);
                const totalQty = plannedQty(s, prod, area).toFixed(1);
                const sacos = sacosFor(prod, totalQty);
                // Percentual realizado no mês/ano selecionado (só fica completo com 100%)
                const selM = SCHED_MONTHS[calMonthIdx];
                const planned = Number(totalQty);
                const applied = vd.applications.filter(a => a.productId === s.productId && a.propertyId === s.propertyId && refKey(a) === monthKey(selM.year, selM.month)).reduce((t, a) => t + num(a.qty), 0);
                const pct = planned > 0 ? Math.min(100, (applied / planned) * 100) : (applied > 0 ? 100 : 0);
                const done = pct >= 100;
                const remaining = Math.max(0, planned - applied);
                const barColor = pct >= 100 ? COLORS.green : pct > 0 ? COLORS.amber : COLORS.grayLight;
                const now = new Date();
                const regDate = (now.getMonth() === selM.month && now.getFullYear() === selM.year) ? now.toISOString().split("T")[0] : selM.year + "-" + String(selM.month + 1).padStart(2, "0") + "-01";
                const semEstoque = (prod?.stock || 0) <= 0;
                return (
                  <Card key={s.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 500, margin: "0 0 4px", fontSize: 14 }}>{prod?.name}</p>
                        <Badge label={prod?.type} type={prod?.type} />
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {!isLeitura && <button onClick={() => setModal({ type: "schedule", item: { ...s } })} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 16, padding: "4px 8px", cursor: "pointer" }}>✏️</button>}
                        {!isLeitura && <button onClick={() => setConfirm({ type: "schedule", id: s.id, label: prod?.name })} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 16, padding: "4px 8px", cursor: "pointer", color: COLORS.red }}>🗑</button>}
                        {done
                          ? <span style={{ fontSize: 12, color: COLORS.green, background: COLORS.greenLight, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>✓ 100%</span>
                          : semEstoque
                            ? <span style={{ fontSize: 11, color: COLORS.red, background: COLORS.redLight, padding: "4px 8px", borderRadius: 20 }}>Sem estoque</span>
                            : isLeitura ? null : <button onClick={() => setModal({ type: "application", item: { productId: s.productId, propertyId: s.propertyId, areaApplied: area, qty: remaining.toFixed(1), date: isAdubo(prod?.type) ? new Date().toISOString().split("T")[0] : regDate, refMonth: monthKey(selM.year, selM.month) } })} style={{ fontSize: 12, background: COLORS.green, color: "#fff", border: "none", borderRadius: 20, padding: "4px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>{pct > 0 ? "Completar" : "Registrar"}</button>}
                      </div>
                    </div>
                    <p style={{ fontSize: 14, color: "var(--color-text-primary)", margin: "6px 0 0", lineHeight: 1.6 }}>{(s.qty ? "Qtd/mês: " : "Dose: " + prod?.dosePerHa + " " + prod?.unit + "/ha · Total: ") }<strong>{totalQty + " " + prod?.unit}</strong>{sacos !== null && <>{" "}<SacosChip n={sacos} /></>}</p>
                    {s.notes && <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "2px 0 0" }}>{s.notes}</p>}
                    {!done && <p style={{ fontSize: 13, color: semEstoque ? COLORS.red : COLORS.teal, margin: "4px 0 0", fontWeight: 500 }}>{"Estoque: " + (prod?.stock || 0) + " " + prod?.unit + (semEstoque ? " ⚠️" : "")}</p>}
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                        <span>Realizado: <strong style={{ color: pct >= 100 ? COLORS.green : pct > 0 ? COLORS.amber : "var(--color-text-secondary)" }}>{applied.toFixed(1)} {prod?.unit}</strong>{isAdubo(prod?.type) && prod?.bagWeight && applied > 0 ? <strong style={{ color: "var(--color-text-primary)" }}>{" (" + fmtSacos(applied / prod.bagWeight) + " sacos)"}</strong> : ""}</span>
                        <span style={{ fontWeight: 700, fontSize: 14, color: pct > 0 ? barColor : "var(--color-text-secondary)" }}>{pct.toFixed(0)}%</span>
                      </div>
                      <div style={{ background: "var(--color-background-secondary)", borderRadius: 4, height: 8 }}>
                        <div style={{ width: pct + "%", background: barColor, height: "100%", borderRadius: 4, transition: "width 0.3s" }} />
                      </div>
                      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "4px 0 0" }}>Planejado: <strong style={{ color: "var(--color-text-primary)" }}>{planned.toFixed(1)} {prod?.unit}</strong>{sacos !== null ? " (" + sacos + " sacos)" : ""}</p>
                      {!done && remaining > 0 && (
                        <p style={{ fontSize: 14, margin: "6px 0 0", lineHeight: 1.6 }}>
                          <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Falta aplicar: </span>
                          <strong style={{ color: COLORS.amber }}>{remaining.toFixed(1) + " " + prod?.unit}</strong>
                          {sacosFor(prod, remaining) !== null && <>{" "}<SacosChip n={sacosFor(prod, remaining)} tone="amber" /></>}
                        </p>
                      )}
                    </div>
                  </Card>
                );
              });
            })()}
          </div>
        )}

        {/* APLICAÇÕES — Jul/2026 a Jul/2027 */}
        {tab === "apply" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 16, margin: 0 }}>Aplicações</p>
              {!isLeitura && <button onClick={() => setModal({ type: "application", item: {} })} style={{ fontSize: 13, background: COLORS.green, color: "#fff", border: "none", borderRadius: 20, padding: "5px 14px", cursor: "pointer" }}>+ Registrar</button>}
            </div>
            <select value={appPropFilter} onChange={e => setAppPropFilter(Number(e.target.value))} style={{ width: "100%", marginBottom: 10, padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", fontSize: 14 }}>
              <option value={0}>Todas as propriedades</option>
              {vd.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={appMonthIdx} onChange={e => setAppMonthIdx(Number(e.target.value))} style={{ width: "100%", marginBottom: 12, padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", fontSize: 14 }}>
              {(() => { const c = currentAppMonthIdx(); return [c, ...APP_MONTHS.map((_, i) => i).filter(i => i !== c)]; })().map(i => <option key={i} value={i}>{APP_MONTHS[i].label + (i === currentAppMonthIdx() ? " (mês atual)" : "")}</option>)}
              <option value={-1}>{"Sem data de aplicação (" + vd.applications.filter(a => !hasDate(a)).length + ")"}</option>
            </select>
            <PillTabs tabs={[{ id: "defensivo", label: "💊 Defensivos" }, { id: "adubo", label: "🌾 Adubos" }]} value={appFilter} onChange={setAppFilter} />
            {(() => {
              const noDate = appMonthIdx === -1;
              const selMonth = noDate ? { label: "sem data" } : APP_MONTHS[appMonthIdx];
              const fn = appFilter === "defensivo" ? isDefensivo : isAdubo;
              const apps = vd.applications.filter(a => {
                const prod = data.products.find(p => p.id === a.productId);
                const d = new Date(a.date + "T12:00");
                const inPeriod = noDate ? !hasDate(a) : (hasDate(a) && d.getMonth() === selMonth.month && d.getFullYear() === selMonth.year);
                return fn(prod?.type) && (appPropFilter === 0 || a.propertyId === appPropFilter) && inPeriod;
              }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
              if (!apps.length) return <p style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Nenhuma aplicação em {selMonth.label}.</p>;
              return apps.map(a => {
                const prod = data.products.find(p => p.id === a.productId);
                const pr = vd.properties.find(p => p.id === a.propertyId);
                const sacaria = isAdubo(prod?.type) && prod?.bagWeight ? Math.ceil(Number(a.qty) / prod.bagWeight) : null;
                return (
                  <Card key={a.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 500, margin: "0 0 2px", fontSize: 14 }}>{prod?.name}</p>
                        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>{(pr?.name || "") + " · " + (hasDate(a) ? a.date : "⚠️ Sem data")}</p>
                        <Badge label={prod?.type} type={prod?.type} />
                        {isAdubo(prod?.type) && a.refMonth && hasDate(a) && a.refMonth !== a.date.slice(0, 7) && (
                          <span style={{ fontSize: 11, marginLeft: 6, color: COLORS.blue, background: COLORS.blueLight, padding: "2px 8px", borderRadius: 20 }}>{"Ref.: " + refLabel(a.refMonth)}</span>
                        )}
                        {isAdubo(prod?.type) && !inSchedule(vd.schedules, a) && (
                          <span style={{ fontSize: 11, marginLeft: 6, color: COLORS.amber, background: COLORS.amberLight, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>⚠️ Fora do cronograma</span>
                        )}
                        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "6px 0 0" }}>
                          {"Total: " + a.qty + " " + (prod?.unit || "")}
                          {sacaria !== null && <span style={{ color: COLORS.green, fontWeight: 600 }}>{" · Sacos: " + sacaria}</span>}
                          {" · "}<span style={{ color: COLORS.teal, fontWeight: 500 }}>{"R$ " + appCost(a).toFixed(2)}</span>
                        </p>
                        {a.notes && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "2px 0 0" }}>{a.notes}</p>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {!isLeitura && <button title="Copiar aplicação" onClick={() => setModal({ type: "application", item: {
                          productId: a.productId, propertyId: a.propertyId, appType: prod?.type, qty: a.qty, bags: a.bags ?? null, notes: a.notes || "",
                          date: new Date().toISOString().split("T")[0], refMonth: currentRefKey(), copiedFrom: a.id } })}
                          style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer" }}>📋</button>}
                        {!isLeitura && <button onClick={() => setModal({ type: "application", item: { ...a } })} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer" }}>✏️</button>}
                        {!isLeitura && <button onClick={() => setConfirm({ type: "application", id: a.id, label: prod?.name })} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer", color: COLORS.red }}>🗑</button>}
                      </div>
                    </div>
                  </Card>
                );
              });
            })()}
          </div>
        )}

        {/* ESTOQUE */}
        {tab === "stock" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 16, margin: 0 }}>Estoque</p>
              {stockRO ? <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>👁 Somente visualização</span> : <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setModal({ type: "transfer", item: { date: new Date().toISOString().split("T")[0] } })} style={{ fontSize: 12, background: COLORS.blue, color: "#fff", border: "none", borderRadius: 20, padding: "5px 12px", cursor: "pointer" }}>⇄ Transferir</button>
                <button onClick={() => setModal({ type: "purchase", item: {} })} style={{ fontSize: 12, background: COLORS.teal, color: "#fff", border: "none", borderRadius: 20, padding: "5px 12px", cursor: "pointer" }}>+ Compra</button>
                <button onClick={() => setModal({ type: "product", item: {} })} style={{ fontSize: 12, background: COLORS.green, color: "#fff", border: "none", borderRadius: 20, padding: "5px 12px", cursor: "pointer" }}>+ Produto</button>
              </div>}
            </div>
            <PillTabs tabs={[{ id: "defensivo", label: "💊 Defensivos" }, { id: "adubo", label: "🌾 Adubos" }]} value={stockFilter} onChange={setStockFilter} />
            {stockFilter === "defensivo" && (
              <select value={defTypeFilter} onChange={e => setDefTypeFilter(e.target.value)} style={{ width: "100%", marginBottom: 12, padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", fontSize: 14 }}>
                <option value="">Todos os defensivos</option>
                {PRODUCT_TYPES.filter(isDefensivo).map(t => <option key={t} value={t}>{t.replace("Defensivo ", "")}</option>)}
              </select>
            )}
            {data.products
              .filter(p => stockFilter === "defensivo" ? isDefensivo(p.type) && (!defTypeFilter || p.type === defTypeFilter) : isAdubo(p.type))
              .slice().sort(byStockKey)
              .map(p => (
              <StockCard key={p.id} p={p} properties={vd.properties} applications={data.applications} purchases={data.purchases}
                onEdit={stockRO ? null : () => setModal({ type: "product", item: { ...p } })}
                onDelete={stockRO ? null : () => setConfirm({ type: "product", id: p.id, label: p.name })} />
            ))}
            <SectionTitle>Transferências</SectionTitle>
            {(() => {
              const moves = data.products
                .filter(p => stockFilter === "defensivo" ? isDefensivo(p.type) : isAdubo(p.type))
                .flatMap(p => (p.moves || []).map(mv => ({ ...mv, p })))
                .filter(mv => isMaster || canSeeProp(mv.from === NONE ? null : mv.from) || canSeeProp(mv.to === NONE ? null : mv.to))
                .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);
              if (!moves.length) return <p style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: "0 0 12px" }}>Nenhuma transferência registrada.</p>;
              return moves.map(mv => (
                <div key={mv.p.id + "-" + mv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 13 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 500 }}>{mv.p.name + " · " + fmtQty(mv.p, mv.qty)}</p>
                    <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 12 }}>{bucketName(mv.from, data.properties) + " → " + bucketName(mv.to, data.properties) + " · " + mv.date + (mv.by ? " · " + mv.by : "")}</p>
                    {mv.notes && <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 12 }}>{mv.notes}</p>}
                  </div>
                  {isMaster && stockAt(mv.p, mv.to) >= num(mv.qty) && (
                    <button onClick={() => setConfirm({ type: "transfer", id: { productId: mv.p.id, moveId: mv.id }, label: "a transferência de " + mv.p.name + " (volta para " + bucketName(mv.from, data.properties) + ")" })} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer", color: COLORS.red }}>↩︎ Desfazer</button>
                  )}
                </div>
              ));
            })()}
            <SectionTitle>Histórico de compras</SectionTitle>
            {/* Filtro por tipo */}
            <select value={purchaseTypeFilter} onChange={e => setPurchaseTypeFilter(e.target.value)} style={{ width: "100%", marginBottom: 12, padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", fontSize: 14 }}>
              <option value="">Todos os tipos</option>
              {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {data.purchases.slice().reverse().map(c => {
              const prod = data.products.find(p => p.id === c.productId);
              if (!prod) return null;
              const showStock = stockFilter === "defensivo" ? isDefensivo(prod.type) : isAdubo(prod.type);
              if (!showStock) return null;
              if (purchaseTypeFilter && prod.type !== purchaseTypeFilter) return null;
              return (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 13 }}>
                  <div><p style={{ margin: 0, fontWeight: 500 }}>{prod.name}</p><p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 12 }}>{c.date + " · " + c.qty + " " + prod.unit + " → " + bucketName(bucketKey(c.propertyId), data.properties)}</p></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={{ margin: 0, color: COLORS.teal, fontWeight: 500 }}>{"R$ " + (c.totalCost || 0).toLocaleString("pt-BR")}</p>
                    {!stockRO && <><button onClick={() => setModal({ type: "purchase", item: { ...c } })} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer" }}>✏️</button>
                    <button onClick={() => setConfirm({ type: "purchase", id: c.id, label: prod.name })} style={{ fontSize: 12, background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "2px 8px", cursor: "pointer", color: COLORS.red }}>🗑</button></>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* USUÁRIOS */}
        {tab === "history" && (
          <div>
            <p style={{ fontWeight: 500, fontSize: 16, margin: "0 0 4px" }}>Histórico</p>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 12px" }}>Notificações de aplicações já lidas</p>
            {readList.length === 0
              ? <p style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Nenhuma notificação lida ainda.</p>
              : readList.map(n => <Card key={n.id} style={{ marginBottom: 8 }}><NotifItem n={n} /></Card>)}
          </div>
        )}

        {tab === "users" && canManageUsers(currentUser.role) && (
          <UserManager users={users} setUsers={changeUsers} properties={data.properties} currentUser={currentUser} />
        )}

        {/* RELATÓRIOS */}
        {tab === "reports" && canSeeReports && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 16, margin: 0 }}>Relatórios</p>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={exportCSV} style={{ fontSize: 12, background: COLORS.teal, color: "#fff", border: "none", borderRadius: 20, padding: "5px 12px", cursor: "pointer" }}>📥 CSV</button>
                <button onClick={exportTxt} style={{ fontSize: 12, background: COLORS.blue, color: "#fff", border: "none", borderRadius: 20, padding: "5px 12px", cursor: "pointer" }}>📄 TXT</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <MetricCard label="Total em aplicações" value={"R$ " + vd.applications.reduce((s,a) => s + appCost(a), 0).toLocaleString("pt-BR", { minimumFractionDigits: 0 })} />
              <MetricCard label="Total em compras" value={"R$ " + data.purchases.reduce((s,p) => s + (p.totalCost || 0), 0).toLocaleString("pt-BR", { minimumFractionDigits: 0 })} />
            </div>

            {/* Planejado vs Realizado */}
            <Card style={{ marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 12px" }}>📋 Planejado vs Realizado por mês</p>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Propriedade</label>
                <select value={curProp} onChange={e => setSelectedProp(Number(e.target.value))} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", fontSize: 14 }}>
                  {vd.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {MONTHS.map((mLabel, mIdx) => {
                const schedsThisMonth = vd.schedules.filter(s => s.propertyId === curProp && s.months.includes(mIdx + 1));
                if (!schedsThisMonth.length) return null;
                return (
                  <div key={mIdx} style={{ marginBottom: 14 }}>
                    <p style={{ fontWeight: 500, fontSize: 13, margin: "0 0 8px", borderBottom: "0.5px solid var(--color-border-tertiary)", paddingBottom: 4 }}>{mLabel}</p>
                    {schedsThisMonth.map(s => {
                      const prod = data.products.find(p => p.id === s.productId);
                      const prop = vd.properties.find(p => p.id === s.propertyId);
                      const planned = plannedQty(s, prod, prop?.area);
                      const applied = appliedQtyForSchedule(s, mIdx);
                      const pct = planned > 0 ? Math.min(100, (applied / planned) * 100) : 0;
                      const barColor = pct >= 100 ? COLORS.green : pct > 0 ? COLORS.amber : COLORS.red;
                      const statusLabel = pct >= 100 ? "✓ Concluído" : pct > 0 ? "Parcial" : "Pendente";
                      const statusBg = pct >= 100 ? COLORS.greenLight : pct > 0 ? COLORS.amberLight : COLORS.redLight;
                      const statusText = pct >= 100 ? COLORS.green : pct > 0 ? COLORS.amber : COLORS.red;
                      return (
                        <div key={s.id} style={{ marginBottom: 10, padding: "10px 12px", background: "var(--color-background-secondary)", borderRadius: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <div><p style={{ fontWeight: 500, margin: "0 0 2px", fontSize: 13 }}>{prod?.name}</p><Badge label={prod?.type} type={prod?.type} /></div>
                            <span style={{ fontSize: 11, fontWeight: 600, background: statusBg, color: statusText, padding: "3px 10px", borderRadius: 20 }}>{statusLabel}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                            <span>Planejado: <strong>{planned.toFixed(1)} {prod?.unit}</strong></span>
                            <span>Realizado: <strong style={{ color: barColor }}>{applied.toFixed(1)} {prod?.unit}</strong></span>
                          </div>
                          <div style={{ background: "var(--color-background-primary)", borderRadius: 4, height: 8, overflow: "hidden" }}>
                            <div style={{ width: pct + "%", background: barColor, height: "100%", borderRadius: 4, transition: "width 0.3s" }} />
                          </div>
                          <p style={{ textAlign: "right", fontSize: 11, fontWeight: 600, color: barColor, margin: "3px 0 0" }}>{pct.toFixed(0)}%</p>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {vd.schedules.filter(s => s.propertyId === curProp).length === 0 && (
                <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Nenhum agendamento para esta propriedade.</p>
              )}
            </Card>

            <Card style={{ marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 10px" }}>Custo por propriedade</p>
              {vd.properties.map(p => {
                const cost = propCost(p.id);
                const total = vd.applications.reduce((s,a) => s + appCost(a), 0);
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
              <PieChart slices={data.products.map((p, i) => ({ label: p.name, value: vd.applications.filter(a => a.productId === p.id).reduce((s,a) => s + appCost(a), 0), color: [COLORS.greenMid, COLORS.blue, "#D4537E", COLORS.amber, COLORS.teal][i % 5] })).filter(s => s.value > 0)} />
            </Card>
            <Card style={{ marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 10px" }}>Aplicações por mês</p>
              <BarChart data={MONTHS.map((m, i) => ({ label: m, value: vd.applications.filter(a => new Date(a.date).getMonth() === i).length }))} color={COLORS.greenMid} />
            </Card>
            <Card style={{ marginBottom: 12 }}>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 10px" }}>Custo mensal (R$)</p>
              <BarChart data={MONTHS.map((m, i) => ({ label: m, value: vd.applications.filter(a => new Date(a.date).getMonth() === i).reduce((s,a) => s + appCost(a), 0) }))} color={COLORS.teal} />
            </Card>
          </div>
        )}
      </div>

      {modal && <FormModal modal={modal} data={vd} onClose={() => setModal(null)} onSave={(type, item) => type === "transfer" ? saveTransfer(item) : save(type, item)} />}
      {pwOpen && <PasswordModal user={users.find(u => String(u.id) === String(currentUser.id)) || currentUser} onClose={() => setPwOpen(false)}
        onSave={async (hash) => {
          try {
            const saved = await updateUsers(list => list.map(u => String(u.id) === String(currentUser.id) ? { ...u, password: hash } : u));
            setUsers(saved); setCurrentUser(cu => ({ ...cu, password: hash }));
            return true;
          } catch (e) { console.error(e); return false; }
        }} />}

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

      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 420, background: "var(--color-background-primary)", borderTop: "0.5px solid var(--color-border-tertiary)", display: "flex" }}>
        {navItems
          .filter(n => !n.masterOnly || canManageUsers(currentUser.role))
          .filter(n => !n.restricted || canSeeReports)
          .map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} style={{ flex: 1, padding: "8px 2px 12px", border: "none", background: "none", cursor: "pointer", color: tab === n.id ? COLORS.green : "var(--color-text-secondary)", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
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
  const [form, setForm] = useState(() => {
    const it = { ...(modal.item || {}) };
    // Aplicação de adubo: converte kg em sacos para preencher o campo "Quantidade de sacos"
    if (modal.type === "schedule" && it.productId && !it.schedType) {
      const prS = data.products.find(p => p.id === Number(it.productId));
      if (prS) it.schedType = prS.type;
    }
    if (modal.type === "application" && !it.refMonth) it.refMonth = it.id ? (refKey(it) || currentRefKey()) : currentRefKey();
    if (modal.type === "application" && it.productId && !it.appType) {
      const pr0 = data.products.find(p => p.id === Number(it.productId));
      if (pr0) it.appType = pr0.type;
    }
    if (modal.type === "application" && it.bags == null && it.qty) {
      const pr = data.products.find(p => p.id === Number(it.productId));
      if (isAdubo(pr?.type) && pr?.bagWeight) {
        const b = Number(it.qty) / pr.bagWeight;
        it.bags = it.id ? Math.round(b * 100) / 100 : Math.ceil(b);
      }
    }
    return it;
  });
  const [months, setMonths] = useState(modal.item?.months || []);
  const [stockError, setStockError] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const titleMap = {
    application: isEdit ? "Editar Aplicação" : modal.item?.copiedFrom ? "Copiar Aplicação" : "Registrar Aplicação",
    purchase: isEdit ? "Editar Compra" : "Registrar Compra",
    product: isEdit ? "Editar Produto" : "Cadastrar Produto",
    schedule: isEdit ? "Editar Agendamento" : "Novo Agendamento",
    property: isEdit ? "Editar Lavoura" : "Nova Lavoura",
    transfer: "Transferir entre propriedades",
  };

  const submit = () => {
    const base = { ...form, id: form.id || Date.now() };
    if (modal.type === "application") {
      const prod = data.products.find(p => p.id === Number(form.productId));
      const prop = data.properties.find(p => p.id === Number(form.propertyId));
      const bagMode = isAdubo(prod?.type) && prod?.bagWeight;
      // Adubo: sacos × peso da sacaria = quilos (usado no estoque e no comparativo com o cronograma)
      const qty = bagMode ? Number(form.bags || 0) * prod.bagWeight : Number(form.qty);
      if (!prod) { setStockError("Escolha o produto."); return; }
      if (!form.propertyId) { setStockError("Escolha a propriedade."); return; }
      if (!hasDate(form)) { setStockError("Informe a data da aplicação."); return; }
      if (bagMode && !(Number(form.bags) > 0)) { setStockError("Informe a quantidade de sacos."); return; }
      if (!bagMode && !(qty > 0)) { setStockError("Informe a quantidade."); return; }
      // Disponível = estoque da propriedade + Não alocado (na edição, soma o que esta aplicação já tinha tirado)
      const oldApp = isEdit ? modal.item : null;
      const back = oldApp && oldApp.productId === prod.id ? (oldApp.takenFrom && Object.keys(oldApp.takenFrom).length ? oldApp.takenFrom : { [NONE]: num(oldApp.qty) }) : {};
      const kP = bucketKey(form.propertyId);
      const avail = stockAt(prod, kP) + num(back[kP]) + (kP === NONE ? 0 : stockAt(prod, NONE) + num(back[NONE]));
      if (avail <= 0) { setStockError("Sem estoque deste produto nesta propriedade nem no Não alocado. Registre uma compra ou peça uma transferência."); return; }
      if (qty > avail + 0.001) { setStockError("Quantidade (" + round2(qty) + " " + prod.unit + ") maior que o disponível para esta propriedade (" + round2(avail) + " " + prod.unit + ")."); return; }
      setStockError("");
      delete base.appType;
      delete base.copiedFrom;
      onSave("application", { ...base, productId: Number(form.productId), propertyId: Number(form.propertyId), areaApplied: Number(form.areaApplied) || prop?.area || 0, qty, bags: bagMode ? Number(form.bags) : null, refMonth: isAdubo(prod?.type) ? (form.refMonth || currentRefKey()) : null });
    } else if (modal.type === "purchase") {
      onSave("purchase", { ...base, productId: Number(form.productId), qty: Number(form.qty), totalCost: Number(form.totalCost), propertyId: form.propertyId && form.propertyId !== NONE ? Number(form.propertyId) : null });
    } else if (modal.type === "transfer") {
      const prod = data.products.find(p => p.id === Number(form.productId));
      const bagMode = isAdubo(prod?.type) && prod?.bagWeight;
      const qty = bagMode ? num(form.bags) * prod.bagWeight : num(form.qty);
      if (!prod) { setStockError("Escolha o produto."); return; }
      if (!form.from || !form.to) { setStockError("Escolha a origem e o destino."); return; }
      if (bucketKey(form.from) === bucketKey(form.to)) { setStockError("Origem e destino são iguais."); return; }
      if (!hasDate(form)) { setStockError("Informe a data da transferência."); return; }
      if (!(qty > 0)) { setStockError("Informe a quantidade."); return; }
      if (qty > stockAt(prod, form.from) + 0.001) { setStockError("A origem só tem " + fmtQty(prod, stockAt(prod, form.from)) + "."); return; }
      onSave("transfer", { productId: prod.id, from: form.from, to: form.to, qty, date: form.date, notes: form.notes });
    } else if (modal.type === "product") {
      onSave("product", { ...base, activeIngredient: isDefensivo(form.type) ? (form.activeIngredient || "").trim() : null, dosePerHa: Number(form.dosePerHa) || 0, bagWeight: form.bagWeight ? Number(form.bagWeight) : null });
    } else if (modal.type === "schedule") {
      delete base.schedType;
      onSave("schedule", { ...base, productId: Number(form.productId), propertyId: Number(form.propertyId), qty: form.qty ? Number(form.qty) : null, months });
    } else if (modal.type === "property") {
      onSave("property", { ...base, area: Number(form.area) });
    }
  };

  const inp = (label, key, type, placeholder, suffix) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 13, color: "#fff", fontWeight: 700, display: "block", marginBottom: 5 }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input type={type || "text"} value={form[key] !== undefined ? form[key] : ""} onChange={e => { set(key, e.target.value); if (key === "qty") setStockError(""); }} placeholder={placeholder || ""} style={{ width: "100%", boxSizing: "border-box", paddingRight: suffix ? 60 : 12 }} />
        {suffix && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#666", fontWeight: 500, pointerEvents: "none" }}>{suffix}</span>}
      </div>
    </div>
  );

  const sel = (label, key, opts) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 13, color: "#fff", fontWeight: 700, display: "block", marginBottom: 5 }}>{label}</label>
      <select value={form[key] !== undefined ? form[key] : ""} onChange={e => set(key, e.target.value)} style={{ width: "100%" }}>
        <option value="">Selecione...</option>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  const renderFields = () => {
    if (modal.type === "application") {
      const prod = data.products.find(p => p.id === Number(form.productId));
      const stockOk = !prod || prod.stock > 0;
      return (
        <div>
          {sel("Tipo de produto", "appType", PRODUCT_TYPES.map(t => ({ value: t, label: t })))}
          {sel("Produto", "productId", data.products
            .filter(p => !form.appType || p.type === form.appType || p.id === Number(form.productId))
            .slice().sort(byName)
            .map(p => ({ value: p.id, label: p.name + (p.activeIngredient ? " · " + p.activeIngredient : "") + " (" + p.stock + " " + p.unit + " em estoque)" })))}
          {prod && (
            <div style={{ background: stockOk ? "rgba(255,255,255,0.15)" : "rgba(163,45,45,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 12, color: "#fff", fontWeight: 500 }}>
                {!stockOk ? "⚠️ Sem estoque — registre uma compra primeiro"
                  : form.propertyId
                    ? "✅ Nesta propriedade: " + fmtQty(prod, stockAt(prod, form.propertyId)) + " · Não alocado: " + fmtQty(prod, stockAt(prod, NONE))
                    : "✅ Estoque total: " + fmtQty(prod, prod.stock) + " (escolha a propriedade para ver o saldo dela)"}
              </p>
            </div>
          )}
          {sel("Propriedade", "propertyId", data.properties.map(p => ({ value: p.id, label: p.name })))}
          {inp("Data da aplicação *", "date", "date")}
          {isAdubo(prod?.type) && (() => {
            const opts = APP_MONTHS.map(m => ({ value: monthKey(m.year, m.month), label: m.label }));
            if (form.refMonth && !opts.some(o => o.value === form.refMonth)) opts.push({ value: form.refMonth, label: refLabel(form.refMonth) });
            const dateKey = hasDate(form) ? form.date.slice(0, 7) : null;
            const ok = !form.propertyId || inSchedule(data.schedules, { productId: prod.id, propertyId: form.propertyId, refMonth: form.refMonth });
            return (
              <div>
                {sel("Mês de referência no cronograma", "refMonth", opts)}
                {dateKey && form.refMonth && dateKey !== form.refMonth && (
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", margin: "-8px 0 12px" }}>{"Aplicada em " + refLabel(dateKey) + ", conta para o cronograma de " + refLabel(form.refMonth) + "."}</p>
                )}
                {!ok && (
                  <div style={{ background: "rgba(186,117,23,0.45)", borderRadius: 8, padding: "8px 12px", margin: "-4px 0 14px" }}>
                    <p style={{ margin: 0, fontSize: 12, color: "#fff", fontWeight: 600 }}>{"⚠️ Fora do cronograma: " + prod.name + " não está programado para esta propriedade em " + refLabel(form.refMonth) + "."}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#fff" }}>Confira o mês de referência. Você pode registrar assim mesmo.</p>
                  </div>
                )}
              </div>
            );
          })()}
          {isAdubo(prod?.type) && prod?.bagWeight ? (
            <div>
              {inp("Quantidade de sacos", "bags", "number", "Ex: 108", "sacos")}
              {Number(form.bags) > 0 && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", margin: "-8px 0 14px" }}>{"= " + (Number(form.bags) * prod.bagWeight).toLocaleString("pt-BR") + " kg (sacos de " + prod.bagWeight + " kg)"}</p>}
            </div>
          ) : (
            <div>
              {isAdubo(prod?.type) && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", margin: "0 0 14px" }}>⚠️ Cadastre o peso da sacaria deste adubo (Estoque → ✏️) para lançar em sacos.</p>}
              {inp("Quantidade (" + (prod ? prod.unit : "unid") + ")", "qty", "number", "Ex: 36", prod ? prod.unit : "")}
            </div>
          )}
          {stockError && (
            <div style={{ background: "rgba(163,45,45,0.4)", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 12, color: "#fff" }}>⚠️ {stockError}</p>
            </div>
          )}
          {inp("Observações", "notes", "text", "Ex: Concluída")}
        </div>
      );
    }
    if (modal.type === "transfer") {
      const prod = data.products.find(p => p.id === Number(form.productId));
      const bagMode = isAdubo(prod?.type) && prod?.bagWeight;
      const buckets = [{ value: NONE, name: "Não alocado" }, ...data.properties.map(p => ({ value: String(p.id), name: p.name }))];
      return (
        <div>
          {sel("Tipo de produto", "trType", PRODUCT_TYPES.map(t => ({ value: t, label: t })))}
          {sel("Produto", "productId", data.products.filter(p => (!form.trType || p.type === form.trType) && num(p.stock) > 0).slice().sort(byName)
            .map(p => ({ value: p.id, label: p.name + (p.activeIngredient ? " · " + p.activeIngredient : "") })))}
          {sel("De (origem)", "from", buckets.filter(b => !prod || stockAt(prod, b.value) > 0).map(b => ({ value: b.value, label: b.name + (prod ? " — " + fmtQty(prod, stockAt(prod, b.value)) : "") })))}
          {sel("Para (destino)", "to", buckets.filter(b => b.value !== form.from).map(b => ({ value: b.value, label: b.name + (prod ? " — " + fmtQty(prod, stockAt(prod, b.value)) : "") })))}
          {inp("Data da transferência *", "date", "date")}
          {bagMode ? (
            <div>
              {inp("Quantidade de sacos", "bags", "number", "Ex: 20", "sacos")}
              {num(form.bags) > 0 && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", margin: "-8px 0 14px" }}>{"= " + (num(form.bags) * prod.bagWeight).toLocaleString("pt-BR") + " kg"}</p>}
            </div>
          ) : inp("Quantidade (" + (prod ? prod.unit : "unid") + ")", "qty", "number", "Ex: 10", prod ? prod.unit : "")}
          {stockError && <div style={{ background: "rgba(163,45,45,0.4)", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}><p style={{ margin: 0, fontSize: 12, color: "#fff" }}>⚠️ {stockError}</p></div>}
          {inp("Observação", "notes", "text", "Ex: levado no caminhão da fazenda")}
        </div>
      );
    }
    if (modal.type === "purchase") {
      const prod = data.products.find(p => p.id === Number(form.productId));
      return (
        <div>
          {sel("Tipo de produto", "purchaseType", PRODUCT_TYPES.map(t => ({ value: t, label: t })))}
          {sel("Produto", "productId", data.products.filter(p => !form.purchaseType || p.type === form.purchaseType).map(p => ({ value: p.id, label: p.name })))}
          {sel("Entra no estoque de", "propertyId", [{ value: NONE, label: "Não alocado (estoque geral)" }, ...data.properties.map(p => ({ value: p.id, label: p.name }))])}
          {inp("Data da compra", "date", "date")}
          {inp("Quantidade comprada", "qty", "number", "Ex: 200", prod ? prod.unit : "")}
          {inp("Custo total (R$)", "totalCost", "number", "Ex: 1500.00")}
        </div>
      );
    }
    if (modal.type === "product") return (
      <div>
        {inp("Nome do produto", "name", "text", "Ex: NPK 20-05-20")}
        {sel("Tipo de produto", "type", PRODUCT_TYPES.map(t => ({ value: t, label: t })))}
        {isDefensivo(form.type) && inp("Princípio ativo", "activeIngredient", "text", "Ex: Azoxistrobina + Ciproconazol")}
        {inp("Unidade de medida", "unit", "text", "Ex: kg, L, g")}
        {!form.type
          ? <p style={{ fontSize: 12, opacity: 0.75, margin: "-6px 0 14px" }}>Escolha o tipo de produto para ver os campos.</p>
          : isAdubo(form.type)
            ? inp("Peso da sacaria (kg)", "bagWeight", "number", "Ex: 50")
            : inp("Dose por hectare", "dosePerHa", "number", "Ex: 0.8")}
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", margin: "0 0 4px" }}>O preço é calculado pelas compras registradas (custo ÷ quantidade).</p>
      </div>
    );
    if (modal.type === "schedule") return (
      <div>
        {sel("Tipo de produto", "schedType", PRODUCT_TYPES.map(t => ({ value: t, label: t })))}
        {sel("Produto", "productId", data.products
          .filter(p => !form.schedType || p.type === form.schedType || p.id === Number(form.productId))
          .slice().sort(byName)
          .map(p => ({ value: p.id, label: p.name + (p.activeIngredient ? " · " + p.activeIngredient : "") })))}
        {(() => {
          // Mostra a dose por hectare do produto escolhido (quando cadastrada)
          const prD = data.products.find(p => p.id === Number(form.productId));
          if (!prD || !(num(prD.dosePerHa) > 0)) return null;
          const propD = data.properties.find(p => p.id === Number(form.propertyId));
          const tot = propD ? num(prD.dosePerHa) * num(propD.area) : null;
          const sc = tot ? sacosFor(prD, tot) : null;
          return (
            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "8px 12px", margin: "-6px 0 14px" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#fff", fontWeight: 500 }}>{"Dose: " + prD.dosePerHa + " " + prD.unit + "/ha"}</p>
              {tot !== null && <p style={{ margin: "2px 0 0", fontSize: 12, color: "rgba(255,255,255,0.85)" }}>{"Para " + propD.name + " (" + propD.area + " ha): " + round2(tot) + " " + prD.unit + (sc !== null ? " · " + sc + " sacos" : "")}</p>}
            </div>
          );
        })()}
        {sel("Propriedade", "propertyId", data.properties.map(p => ({ value: p.id, label: p.name })))}
        {(() => {
          const pr = data.products.find(p => p.id === Number(form.productId));
          const sc = sacosFor(pr, form.qty);
          return (
            <div>
              {inp("Quantidade por mês (" + (pr ? pr.unit : "unid") + ")", "qty", "number", "Ex: 5400", pr ? pr.unit : "")}
              {sc !== null && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", margin: "-8px 0 14px" }}>{"= " + sc + " sacos de " + pr.bagWeight + " kg por mês"}</p>}
            </div>
          );
        })()}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, color: "#fff", fontWeight: 700, display: "block", marginBottom: 6 }}>Meses de aplicação</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
            {SCHED_MONTHS.map((m) => { const n = m.month + 1; return (
              <button key={m.label} onClick={() => setMonths(ms => ms.includes(n) ? ms.filter(x => x !== n) : [...ms, n])}
                style={{ padding: "7px 4px", borderRadius: 8, border: "0.5px solid " + (months.includes(n) ? "#fff" : "rgba(255,255,255,0.3)"), background: months.includes(n) ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: months.includes(n) ? 700 : 400 }}>
                {m.label}
              </button>
            ); })}
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
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", width: 32, height: 32, fontSize: 16, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        {renderFields()}
        <button onClick={submit} style={{ width: "100%", background: "#fff", color: COLORS.green, border: "none", borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>
          {isEdit ? "Salvar alterações" : "Adicionar"}
        </button>
      </div>
    </div>
  );
}
