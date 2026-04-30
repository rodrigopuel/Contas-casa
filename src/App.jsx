import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase ─────────────────────────────────────────────────────────
const SUPA_URL = "https://jopwgmfnshsxfmvmmimc.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvcHdnbWZuc2hzeGZtdm1taW1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MDc1MzksImV4cCI6MjA5MzA4MzUzOX0.dJaS41qLYHsn_bJQRjO8p9jljRklmQdLnevNjHJ3cGE";
const sb = createClient(SUPA_URL, SUPA_KEY);

// ─── Categories ───────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "mercado",     label: "Mercado",     icon: "🛒" },
  { id: "restaurante", label: "Restaurante", icon: "🍽️" },
  { id: "saude",       label: "Saúde",       icon: "🏥" },
  { id: "transporte",  label: "Transporte",  icon: "🚗" },
  { id: "casa",        label: "Casa",        icon: "🏠" },
  { id: "lazer",       label: "Lazer",       icon: "🎉" },
  { id: "educacao",    label: "Educação",    icon: "📚" },
  { id: "vestuario",   label: "Vestuário",   icon: "👗" },
  { id: "servicos",    label: "Serviços",    icon: "🔧" },
  { id: "outros",      label: "Outros",      icon: "📦" },
];

const NAMES = { p1: "Rodrigo", p2: "Tatiana" };

// ─── Helpers ──────────────────────────────────────────────────────────
const fmt = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtShort = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtFull  = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

const calcBalance = (exps) => {
  let p1owes = 0, p2owes = 0;
  exps.forEach(e => {
    const amt = Number(e.amount);
    if (e.beneficiary === "both") {
      const half = amt / 2;
      if (e.payer === "p1") p2owes += half; else p1owes += half;
    } else if (e.beneficiary !== e.payer) {
      if (e.payer === "p1") p2owes += amt; else p1owes += amt;
    }
  });
  return { net: p2owes - p1owes, p1owes, p2owes };
};

const compressImage = (file) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 900;
      let { width, height } = img;
      if (width > height && width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
      else if (height >= width && height > MAX) { width = Math.round(width * MAX / height); height = MAX; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

// ─── App ──────────────────────────────────────────────────────────────
export default function App() {
  const [expenses,    setExpenses]    = useState([]);
  const [history,     setHistory]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [view,        setView]        = useState("home");
  const [selHist,     setSelHist]     = useState(null);
  const [form,        setForm]        = useState(null);
  const [toast,       setToast]       = useState(null);
  const [filterPayer, setFilterPayer] = useState("all");

  useEffect(() => {
    Promise.all([fetchExpenses(), fetchHistory()]).finally(() => setLoading(false));
    const channel = sb.channel("realtime-expenses")
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => fetchExpenses())
      .subscribe();
    return () => sb.removeChannel(channel);
  }, []);

  const fetchExpenses = async () => {
    const { data, error } = await sb.from("expenses").select("*").order("created_at", { ascending: false });
    if (!error) setExpenses(data || []);
  };

  const fetchHistory = async () => {
    const { data, error } = await sb.from("closings").select("*").order("closed_at", { ascending: false });
    if (!error) setHistory(data || []);
  };

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openAdd = () => {
    setForm({ payer: "p1", description: "", category: "", amount: "", beneficiary: "both", date: new Date().toISOString().slice(0, 10), photo: null, photoName: "" });
    setView("add");
  };

  const handlePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setForm(f => ({ ...f, photo: compressed, photoName: file.name }));
  };

  const submitExpense = async () => {
    if (!form.description.trim()) return showToast("Informe a descrição.", "err");
    if (!form.amount || isNaN(parseFloat(form.amount.replace(",", ".")))) return showToast("Informe o valor.", "err");
    if (!form.category) return showToast("Selecione a categoria.", "err");
    setSaving(true);
    const { error } = await sb.from("expenses").insert({
      payer: form.payer, description: form.description.trim(), category: form.category,
      amount: parseFloat(form.amount.replace(",", ".")), beneficiary: form.beneficiary,
      date: form.date, photo: form.photo || null, photo_name: form.photoName || null,
    });
    setSaving(false);
    if (error) return showToast("Erro ao salvar. Tente novamente.", "err");
    showToast("Lançamento salvo! ✅");
    setView("home");
  };

  const deleteExpense = async (id) => {
    if (!window.confirm("Excluir este lançamento?")) return;
    const { error } = await sb.from("expenses").delete().eq("id", id);
    if (error) showToast("Erro ao remover.", "err");
    else { setExpenses(ex => ex.filter(x => x.id !== id)); showToast("Removido."); }
  };

  const doClose = async () => {
    if (expenses.length === 0) { showToast("Nenhum lançamento para fechar.", "err"); setView("home"); return; }
    setSaving(true);
    const { error: errClose } = await sb.from("closings").insert({ expenses, balance: calcBalance(expenses), names: NAMES });
    if (errClose) { setSaving(false); return showToast("Erro ao fechar. Tente novamente.", "err"); }
    const { error: errDel } = await sb.from("expenses").delete().neq("id", 0);
    setSaving(false);
    if (errDel) return showToast("Erro ao limpar lançamentos.", "err");
    setExpenses([]);
    await fetchHistory();
    setView("home");
    showToast("Contas fechadas e salvas! 🎉");
  };

  const bal = calcBalance(expenses);
  const filtered = filterPayer === "all" ? expenses : expenses.filter(e => e.payer === filterPayer);

  if (loading) return (
    <div style={S.loadScreen}>
      <style>{css}</style>
      <div style={{ fontSize: 52 }}>💳</div>
      <div style={S.loadTitle}>Contas do Casal</div>
      <div style={S.loadSub}>Carregando...</div>
      <div style={S.spinner} />
    </div>
  );

  return (
    <div style={S.root}>
      <style>{css}</style>

      {toast && <div style={{ ...S.toast, background: toast.type === "err" ? "#ef4444" : "#10b981" }}>{toast.msg}</div>}

      {saving && (
        <div style={S.overlay}>
          <div style={S.savingBox}>
            <div style={S.spinner} />
            <span style={{ marginLeft: 12, fontSize: 14, fontWeight: 700, color: "#334155" }}>Salvando...</span>
          </div>
        </div>
      )}

      {view === "history_detail" && selHist && (
        <Screen title={`Fechamento ${fmtShort(selHist.closed_at)}`} onBack={() => setView("history")}>
          <HistoryDetail snap={selHist} />
        </Screen>
      )}

      {view === "history" && (
        <Screen title="Histórico" onBack={() => setView("home")}>
          {history.length === 0 ? <Empty text="Nenhum fechamento ainda." /> : history.map(snap => {
            const b = snap.balance; const n = snap.names || NAMES;
            return (
              <div key={snap.id} style={S.histCard} onClick={() => { setSelHist(snap); setView("history_detail"); }}>
                <div>
                  <div style={S.histDate}>{fmtFull(snap.closed_at)}</div>
                  <div style={S.histCount}>{snap.expenses?.length || 0} lançamentos</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {b.net === 0
                    ? <span style={{ color: "#10b981", fontWeight: 700, fontSize: 13 }}>Quites ✅</span>
                    : b.net > 0
                      ? <span style={S.histBal}>{n.p2} devia {fmt(Math.abs(b.net))}</span>
                      : <span style={S.histBal}>{n.p1} devia {fmt(Math.abs(b.net))}</span>
                  }
                  <div style={{ fontSize: 20, color: "#94a3b8" }}>›</div>
                </div>
              </div>
            );
          })}
        </Screen>
      )}

      {view === "close_confirm" && (
        <Screen title="Fechar as Contas" onBack={() => setView("home")}>
          <div style={S.card}>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: "#334155", marginBottom: 16 }}>
              Todos os lançamentos serão arquivados e o saldo zerado. Um resumo ficará salvo no histórico.
            </p>
            <div style={S.balanceSummary}>
              {bal.net === 0
                ? <span style={{ color: "#10b981", fontWeight: 700 }}>✅ Vocês estão quites!</span>
                : bal.net > 0
                  ? <span><strong>{NAMES.p2}</strong> deve <strong style={{ color: "#ef4444" }}>{fmt(Math.abs(bal.net))}</strong> para <strong>{NAMES.p1}</strong></span>
                  : <span><strong>{NAMES.p1}</strong> deve <strong style={{ color: "#ef4444" }}>{fmt(Math.abs(bal.net))}</strong> para <strong>{NAMES.p2}</strong></span>
              }
            </div>
            <button style={{ ...S.btnPrimary, background: "#ef4444", marginTop: 16 }} onClick={doClose}>🔒 Confirmar Fechamento</button>
            <button style={{ ...S.btnSecondary, marginTop: 8 }} onClick={() => setView("home")}>Cancelar</button>
          </div>
        </Screen>
      )}

      {view === "list" && (
        <Screen title="Lançamentos" onBack={() => setView("home")}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {["all", "p1", "p2"].map(f => (
              <button key={f} style={{ ...S.pill, ...(filterPayer === f ? S.pillActive : {}) }} onClick={() => setFilterPayer(f)}>
                {f === "all" ? "Todos" : f === "p1" ? NAMES.p1 : NAMES.p2}
              </button>
            ))}
          </div>
          {filtered.length === 0 ? <Empty text="Nenhum lançamento." /> : filtered.map(e => <ExpenseCard key={e.id} e={e} onDelete={() => deleteExpense(e.id)} />)}
        </Screen>
      )}

      {view === "add" && form && (
        <Screen title="Novo Lançamento" onBack={() => setView("home")}>
          <p style={S.label}>Quem pagou?</p>
          <div style={S.toggleRow}>
            {[["p1", NAMES.p1], ["p2", NAMES.p2]].map(([v, l]) => (
              <button key={v} style={{ ...S.toggleBtn, ...(form.payer === v ? S.toggleActive : {}) }} onClick={() => setForm(f => ({ ...f, payer: v }))}>{l}</button>
            ))}
          </div>

          <p style={{ ...S.label, marginTop: 16 }}>Para quem é a despesa?</p>
          <div style={S.toggleRow}>
            {[["both", "Ambos (casa)"], ["p1", NAMES.p1], ["p2", NAMES.p2]].map(([v, l]) => (
              <button key={v} style={{ ...S.toggleBtn, ...(form.beneficiary === v ? S.toggleActive : {}) }} onClick={() => setForm(f => ({ ...f, beneficiary: v }))}>{l}</button>
            ))}
          </div>

          <p style={{ ...S.label, marginTop: 16 }}>Categoria</p>
          <div style={S.catGrid}>
            {CATEGORIES.map(c => (
              <button key={c.id} style={{ ...S.catBtn, ...(form.category === c.id ? S.catActive : {}) }} onClick={() => setForm(f => ({ ...f, category: c.id }))}>
                <span style={{ fontSize: 20 }}>{c.icon}</span>
                <span style={{ fontSize: 10, marginTop: 3, textAlign: "center", lineHeight: 1.2 }}>{c.label}</span>
              </button>
            ))}
          </div>

          <p style={{ ...S.label, marginTop: 16 }}>Descrição</p>
          <input style={S.input} placeholder="Ex: Supermercado Extra" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />

          <p style={{ ...S.label, marginTop: 12 }}>Valor (R$)</p>
          <input style={S.input} placeholder="0,00" inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />

          <p style={{ ...S.label, marginTop: 12 }}>Data</p>
          <input style={S.input} type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />

          <p style={{ ...S.label, marginTop: 12 }}>Comprovante (foto)</p>
          <PhotoUpload form={form} onPhoto={handlePhoto} />

          <button style={{ ...S.btnPrimary, marginTop: 20 }} onClick={submitExpense}>Salvar Lançamento</button>
        </Screen>
      )}

      {view === "home" && (
        <div style={S.homeWrap}>
          <div style={S.header}>
            <div>
              <div style={S.headerTitle}>💳 Contas do Casal</div>
              <div style={S.headerSub}>Rodrigo & Tatiana</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={S.syncDot} title="Sincronizado em tempo real" />
              <button style={S.iconBtn} onClick={() => setView("history")}>📂</button>
            </div>
          </div>

          <div style={S.balCard}>
            <div style={S.balLabel}>Saldo atual</div>
            {expenses.length === 0
              ? <div style={S.balZero}>Nenhum lançamento ainda</div>
              : bal.net === 0
                ? <div style={S.balEven}>✅ Vocês estão quites!</div>
                : <div style={S.balDetail}>
                    <span style={S.balName}>{bal.net > 0 ? NAMES.p2 : NAMES.p1}</span>
                    <span style={S.balVerb}> deve </span>
                    <span style={S.balAmt}>{fmt(Math.abs(bal.net))}</span>
                    <div style={S.balFor}>para {bal.net > 0 ? NAMES.p1 : NAMES.p2}</div>
                  </div>
            }
            <div style={S.balRow}>
              <MiniStat label={`${NAMES.p1} pagou`} value={fmt(expenses.filter(e => e.payer === "p1").reduce((s, e) => s + Number(e.amount), 0))} />
              <div style={S.balDivider} />
              <MiniStat label={`${NAMES.p2} pagou`} value={fmt(expenses.filter(e => e.payer === "p2").reduce((s, e) => s + Number(e.amount), 0))} />
            </div>
          </div>

          <div style={S.sectionTitle}>
            Recentes
            {expenses.length > 0 && <span style={S.seeAll} onClick={() => setView("list")}>Ver todos ({expenses.length})</span>}
          </div>
          {expenses.length === 0
            ? <Empty text="Nenhum lançamento ainda. Adicione o primeiro!" />
            : expenses.slice(0, 4).map(e => <ExpenseCard key={e.id} e={e} onDelete={() => deleteExpense(e.id)} />)
          }

          <div style={S.actions}>
            <button style={S.btnAdd} onClick={openAdd}>+ Novo Lançamento</button>
            <button style={S.btnClose} onClick={() => expenses.length > 0 ? setView("close_confirm") : showToast("Nenhum lançamento para fechar.", "err")}>
              🔒 Fechar as Contas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Components ───────────────────────────────────────────────────────

function Screen({ title, onBack, children }) {
  return (
    <div style={S.screenWrap}>
      <div style={S.screenHeader}>
        <button style={S.backBtn} onClick={onBack}>‹ Voltar</button>
        <div style={S.screenTitle}>{title}</div>
        <div style={{ width: 64 }} />
      </div>
      <div style={S.screenBody}>{children}</div>
    </div>
  );
}

function ExpenseCard({ e, onDelete }) {
  const [showPhoto, setShowPhoto] = useState(false);
  const cat = CATEGORIES.find(c => c.id === e.category);
  const payerName = e.payer === "p1" ? NAMES.p1 : NAMES.p2;
  const benLabel  = e.beneficiary === "both" ? "Ambos" : e.beneficiary === "p1" ? NAMES.p1 : NAMES.p2;
  const isDebt    = e.beneficiary !== "both" && e.beneficiary !== e.payer;
  return (
    <div style={S.expCard}>
      <div style={S.expTop}>
        <div style={S.expIcon}>{cat?.icon || "📦"}</div>
        <div style={S.expMid}>
          <div style={S.expDesc}>{e.description}</div>
          <div style={S.expMeta}>
            <span style={S.tag}>{cat?.label}</span>
            <span style={S.tag}>{payerName} pagou</span>
            <span style={{ ...S.tag, ...(e.beneficiary === "both" ? S.tagBoth : isDebt ? S.tagDebt : S.tagPersonal) }}>{benLabel}</span>
          </div>
          <div style={S.expDate}>{fmtShort(e.date)}</div>
        </div>
        <div style={S.expRight}>
          <div style={S.expAmt}>{fmt(e.amount)}</div>
          <div style={S.expBtns}>
            {e.photo && <button style={S.miniBtn} onClick={() => setShowPhoto(v => !v)}>📎</button>}
            <button style={{ ...S.miniBtn, color: "#ef4444" }} onClick={onDelete}>✕</button>
          </div>
        </div>
      </div>
      {showPhoto && e.photo && (
        <div style={S.photoWrap}><img src={e.photo} alt="comprovante" style={S.photoImg} /></div>
      )}
    </div>
  );
}

function HistoryDetail({ snap }) {
  const exps  = snap.expenses || [];
  const bal   = snap.balance;
  const n     = snap.names || NAMES;
  const total = exps.reduce((s, e) => s + Number(e.amount), 0);
  const byCat = CATEGORIES
    .map(c => ({ ...c, total: exps.filter(e => e.category === c.id).reduce((s, e) => s + Number(e.amount), 0) }))
    .filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  return (
    <div>
      <div style={{ ...S.balCard, marginBottom: 16 }}>
        <div style={S.balLabel}>Resumo do Período</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#1e293b", margin: "8px 0" }}>{fmt(total)}</div>
        <div style={S.balRow}>
          <MiniStat label={`${n.p1} pagou`} value={fmt(exps.filter(e => e.payer === "p1").reduce((s, e) => s + Number(e.amount), 0))} />
          <div style={S.balDivider} />
          <MiniStat label={`${n.p2} pagou`} value={fmt(exps.filter(e => e.payer === "p2").reduce((s, e) => s + Number(e.amount), 0))} />
        </div>
        <div style={{ ...S.balanceSummary, marginTop: 14 }}>
          {bal.net === 0
            ? <span style={{ color: "#10b981", fontWeight: 700 }}>✅ Ficaram quites</span>
            : bal.net > 0
              ? <span><strong>{n.p2}</strong> devia <strong style={{ color: "#ef4444" }}>{fmt(Math.abs(bal.net))}</strong> para <strong>{n.p1}</strong></span>
              : <span><strong>{n.p1}</strong> devia <strong style={{ color: "#ef4444" }}>{fmt(Math.abs(bal.net))}</strong> para <strong>{n.p2}</strong></span>
          }
        </div>
      </div>
      <div style={S.sectionTitle}>Por Categoria</div>
      {byCat.map(c => (
        <div key={c.id} style={S.catRow}>
          <span style={{ fontSize: 20 }}>{c.icon}</span>
          <span style={{ flex: 1, marginLeft: 10, fontSize: 14, color: "#334155" }}>{c.label}</span>
          <span style={{ fontWeight: 700, color: "#1e293b", fontSize: 14 }}>{fmt(c.total)}</span>
        </div>
      ))}
      <div style={{ ...S.sectionTitle, marginTop: 20 }}>Todos os Lançamentos</div>
      {exps.map((e, i) => <ExpenseCard key={i} e={e} onDelete={() => {}} />)}
    </div>
  );
}

function PhotoUpload({ form, onPhoto }) {
  const ref = useRef();
  return (
    <div>
      <div style={S.photoZone} onClick={() => ref.current.click()}>
        {form.photo
          ? <img src={form.photo} alt="preview" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 8, objectFit: "contain" }} />
          : <div style={{ color: "#94a3b8", textAlign: "center" }}><div style={{ fontSize: 32 }}>📷</div><div style={{ fontSize: 13 }}>Toque para adicionar foto</div></div>
        }
      </div>
      {form.photo && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{form.photoName}</div>}
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPhoto} />
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{value}</div>
    </div>
  );
}

function Empty({ text }) {
  return <div style={S.empty}>{text}</div>;
}

// ─── Styles ───────────────────────────────────────────────────────────
const S = {
  root:           { fontFamily: "'Nunito','Segoe UI',sans-serif", background: "#f1f5f9", minHeight: "100vh", maxWidth: 480, margin: "0 auto", position: "relative" },
  loadScreen:     { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#1e293b", gap: 8 },
  loadTitle:      { fontSize: 22, fontWeight: 800, color: "#fff" },
  loadSub:        { fontSize: 14, color: "#94a3b8" },
  spinner:        { width: 28, height: 28, border: "3px solid rgba(255,255,255,.15)", borderTop: "3px solid #8b5cf6", borderRadius: "50%", animation: "spin .8s linear infinite", marginTop: 8 },
  toast:          { position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "10px 22px", borderRadius: 24, fontSize: 14, fontWeight: 700, zIndex: 999, boxShadow: "0 4px 20px rgba(0,0,0,.2)", whiteSpace: "nowrap" },
  overlay:        { position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 998, display: "flex", alignItems: "center", justifyContent: "center" },
  savingBox:      { background: "#fff", borderRadius: 16, padding: "16px 24px", display: "flex", alignItems: "center", boxShadow: "0 8px 32px rgba(0,0,0,.2)" },
  homeWrap:       { paddingBottom: 110 },
  header:         { background: "linear-gradient(135deg,#1e293b,#334155)", padding: "48px 20px 28px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  headerTitle:    { fontSize: 22, fontWeight: 800, color: "#fff" },
  headerSub:      { fontSize: 13, color: "#94a3b8", marginTop: 2 },
  syncDot:        { width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" },
  iconBtn:        { background: "rgba(255,255,255,.1)", border: "none", borderRadius: 12, width: 40, height: 40, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  balCard:        { margin: "16px 16px 0", background: "#fff", borderRadius: 20, padding: "20px 20px 16px", boxShadow: "0 2px 16px rgba(0,0,0,.07)" },
  balLabel:       { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8" },
  balZero:        { fontSize: 15, color: "#94a3b8", margin: "10px 0" },
  balEven:        { fontSize: 15, color: "#10b981", fontWeight: 700, margin: "10px 0" },
  balDetail:      { margin: "10px 0" },
  balName:        { fontSize: 20, fontWeight: 800, color: "#1e293b" },
  balVerb:        { fontSize: 15, color: "#64748b" },
  balAmt:         { fontSize: 26, fontWeight: 900, color: "#ef4444" },
  balFor:         { fontSize: 13, color: "#64748b", marginTop: 2 },
  balRow:         { display: "flex", alignItems: "center", marginTop: 14, paddingTop: 14, borderTop: "1px solid #f1f5f9" },
  balDivider:     { width: 1, height: 30, background: "#e2e8f0", margin: "0 12px" },
  balanceSummary: { background: "#f8fafc", borderRadius: 12, padding: "14px 16px", fontSize: 14, color: "#334155", textAlign: "center" },
  sectionTitle:   { padding: "20px 16px 8px", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8", display: "flex", justifyContent: "space-between", alignItems: "center" },
  seeAll:         { fontSize: 12, color: "#6366f1", cursor: "pointer", fontWeight: 700, textTransform: "none", letterSpacing: 0 },
  expCard:        { margin: "0 16px 10px", background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 1px 8px rgba(0,0,0,.06)" },
  expTop:         { display: "flex", alignItems: "flex-start", gap: 10 },
  expIcon:        { fontSize: 26, lineHeight: 1, marginTop: 2 },
  expMid:         { flex: 1, minWidth: 0 },
  expDesc:        { fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  expMeta:        { display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 },
  expDate:        { fontSize: 11, color: "#94a3b8" },
  expRight:       { textAlign: "right", flexShrink: 0 },
  expAmt:         { fontSize: 16, fontWeight: 800, color: "#1e293b" },
  expBtns:        { display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4 },
  miniBtn:        { background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "2px 4px" },
  tag:            { fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "#f1f5f9", color: "#64748b" },
  tagBoth:        { background: "#ede9fe", color: "#7c3aed" },
  tagDebt:        { background: "#fee2e2", color: "#ef4444" },
  tagPersonal:    { background: "#dcfce7", color: "#16a34a" },
  photoWrap:      { marginTop: 10, borderTop: "1px solid #f1f5f9", paddingTop: 10 },
  photoImg:       { width: "100%", borderRadius: 8, objectFit: "cover", maxHeight: 200 },
  actions:        { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#fff", borderTop: "1px solid #e2e8f0", padding: "12px 16px 28px", display: "flex", flexDirection: "column", gap: 8, zIndex: 10 },
  btnAdd:         { background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", borderRadius: 14, padding: 14, fontSize: 16, fontWeight: 800, cursor: "pointer" },
  btnClose:       { background: "#1e293b", color: "#fff", border: "none", borderRadius: 14, padding: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  btnPrimary:     { background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", borderRadius: 14, padding: 14, fontSize: 15, fontWeight: 800, cursor: "pointer", width: "100%", display: "block" },
  btnSecondary:   { background: "#f1f5f9", color: "#334155", border: "none", borderRadius: 14, padding: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", width: "100%", display: "block" },
  screenWrap:     { minHeight: "100vh", background: "#f1f5f9" },
  screenHeader:   { background: "#fff", padding: "48px 16px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", position: "sticky", top: 0, zIndex: 5 },
  screenTitle:    { fontSize: 17, fontWeight: 800, color: "#1e293b" },
  screenBody:     { padding: "16px 16px 80px" },
  backBtn:        { background: "none", border: "none", color: "#6366f1", fontSize: 16, fontWeight: 700, cursor: "pointer", padding: "4px 8px" },
  card:           { background: "#fff", borderRadius: 20, padding: 20, boxShadow: "0 1px 8px rgba(0,0,0,.06)" },
  label:          { fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8, color: "#64748b", marginBottom: 8, display: "block" },
  input:          { width: "100%", padding: "12px 14px", borderRadius: 12, border: "1.5px solid #e2e8f0", fontSize: 15, color: "#1e293b", background: "#f8fafc", boxSizing: "border-box", outline: "none" },
  toggleRow:      { display: "flex", gap: 8 },
  toggleBtn:      { flex: 1, padding: "11px 8px", border: "1.5px solid #e2e8f0", borderRadius: 12, background: "#f8fafc", color: "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  toggleActive:   { background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "1.5px solid transparent" },
  catGrid:        { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 },
  catBtn:         { padding: "10px 4px", border: "1.5px solid #e2e8f0", borderRadius: 12, background: "#f8fafc", color: "#334155", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center" },
  catActive:      { border: "1.5px solid #8b5cf6", background: "#ede9fe", color: "#6366f1" },
  photoZone:      { border: "2px dashed #e2e8f0", borderRadius: 14, padding: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", minHeight: 100, background: "#f8fafc" },
  empty:          { textAlign: "center", color: "#94a3b8", padding: "32px 20px", fontSize: 14 },
  pill:           { padding: "6px 14px", borderRadius: 20, border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  pillActive:     { background: "#ede9fe", color: "#6366f1", border: "1.5px solid #c4b5fd" },
  histCard:       { background: "#fff", borderRadius: 16, padding: "14px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", boxShadow: "0 1px 8px rgba(0,0,0,.06)" },
  histDate:       { fontSize: 15, fontWeight: 700, color: "#1e293b" },
  histCount:      { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  histBal:        { fontSize: 13, fontWeight: 700, color: "#ef4444" },
  catRow:         { display: "flex", alignItems: "center", background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8 },
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
  @keyframes spin { to { transform: rotate(360deg); } }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  body { background: #f1f5f9; }
  input:focus { border-color: #8b5cf6 !important; }
  button:active { opacity: .85; transform: scale(.98); }
`;
