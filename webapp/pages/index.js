import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

const COLUMNS = ["estimation", "ongoing", "archive"];
const COLUMN_META = {
  estimation: { title: "Estimation", sub: "Technical estimation / quotation" },
  ongoing: { title: "Ongoing", sub: "Approved — work in progress" },
  archive: { title: "Archive", sub: "Closed / delivered" },
};
const STAGE_LIBRARY = [
  "Engineering", "Procurement", "Fabrication", "Welding",
  "Sandblasting", "Painting", "Civil Work", "Mobilization",
  "Erecting", "Delivery",
];
const STAGE_STATUS = ["pending", "active", "done"];
const STAGE_COLOR = { pending: "#C9C2B4", active: "#E8A33D", done: "#4A8B5C" };
const COLORS = {
  steel: "#2D3B45", steelDark: "#1A1F23", paper: "#F5F3EE", paper2: "#ECE8DF",
  amber: "#E8A33D", green: "#4A8B5C", rust: "#B4502E", line: "#D8D3C5",
  text: "#1A1F23", textMute: "#6B6F66", white: "#FFFFFF",
};

const uid = () => Math.random().toString(36).slice(2, 10);
const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtDateTime = (iso) => {
  if (!iso) return "—";
  const dt = new Date(iso);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " · " +
    dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

// ---- map between DB row shape (snake_case) and app shape (camelCase) ----
function fromRow(r) {
  return {
    id: r.id, po: r.po, name: r.name, client: r.client || "", supervisor: r.supervisor || "",
    siteType: r.site_type || "workshop", site: r.site || "", notes: r.notes || "",
    column: r.column_name, stages: r.stages || [], deliveryPoDate: r.delivery_po_date,
    history: r.history || [], createdAt: r.created_at, approvedAt: r.approved_at,
    closedAt: r.closed_at, updatedAt: r.updated_at, updatedBy: r.updated_by,
  };
}
function toRow(p) {
  return {
    po: p.po, name: p.name, client: p.client, supervisor: p.supervisor,
    site_type: p.siteType, site: p.site, notes: p.notes, column_name: p.column,
    stages: p.stages, delivery_po_date: p.deliveryPoDate, history: p.history,
    approved_at: p.approvedAt, closed_at: p.closedAt,
    updated_at: new Date().toISOString(), updated_by: p.updatedBy,
  };
}

function Avatar({ name, size = 26 }) {
  const initials = (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", background: COLORS.steel, color: COLORS.paper, fontSize: size * 0.4, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {initials || "?"}
    </span>
  );
}

function StagePipeline({ stages, onCycle, editable }) {
  if (!stages || stages.length === 0) {
    return <div style={{ fontSize: 11.5, color: COLORS.textMute, fontStyle: "italic", margin: "6px 0" }}>No stages defined</div>;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "8px 0 4px" }}>
      {stages.map((s, i) => (
        <button key={s.id || i}
          onClick={(e) => { e.stopPropagation(); if (editable) onCycle(i); }}
          title={editable ? `${s.name}: ${s.status} (click to advance)` : `${s.name}: ${s.status}`}
          disabled={!editable}
          style={{ display: "flex", alignItems: "center", gap: 5, background: COLORS.white, border: `1px solid ${s.status === "pending" ? COLORS.line : STAGE_COLOR[s.status]}`, borderRadius: 12, padding: "3px 9px 3px 6px", fontSize: 11, fontWeight: 500, color: COLORS.text, cursor: editable ? "pointer" : "default" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: STAGE_COLOR[s.status], flexShrink: 0 }} />
          <span>{s.name}</span>
        </button>
      ))}
    </div>
  );
}

function StagePicker({ selected, onChange }) {
  const [custom, setCustom] = useState("");
  const toggle = (name) => {
    const exists = selected.find((s) => s.name === name);
    if (exists) onChange(selected.filter((s) => s.name !== name));
    else onChange([...selected, { name, status: "pending" }]);
  };
  const addCustom = () => {
    const v = custom.trim();
    if (!v) return;
    if (!selected.find((s) => s.name.toLowerCase() === v.toLowerCase())) {
      onChange([...selected, { name: v, status: "pending" }]);
    }
    setCustom("");
  };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
        {STAGE_LIBRARY.map((name) => {
          const on = !!selected.find((s) => s.name === name);
          return (
            <button type="button" key={name} onClick={() => toggle(name)} style={{ border: `1px solid ${on ? COLORS.steel : COLORS.line}`, background: on ? COLORS.steel : COLORS.paper, color: on ? COLORS.paper : COLORS.text, borderRadius: 14, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
              {name}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input placeholder="Add custom stage…" value={custom} onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} style={inputStyle} />
        <button type="button" onClick={addCustom} style={btnGhost}>Add</button>
      </div>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 10 }}>
          <span style={{ fontSize: 11.5, color: COLORS.textMute, marginRight: 4 }}>Order:</span>
          {selected.map((s, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.paper2, borderRadius: 12, padding: "4px 5px 4px 10px", fontSize: 11.5 }}>
              {i + 1}. {s.name}
              <button type="button" onClick={() => onChange(selected.filter((_, x) => x !== i))} style={{ background: "none", border: "none", color: COLORS.textMute, fontSize: 15, lineHeight: 1, padding: "0 4px", cursor: "pointer" }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle = { border: `1px solid ${COLORS.line}`, borderRadius: 4, padding: "9px 10px", fontSize: 13.5, color: COLORS.text, background: COLORS.paper, width: "100%" };
const btnGhost = { background: "transparent", border: `1px solid ${COLORS.line}`, color: COLORS.text, padding: "9px 16px", borderRadius: 5, fontSize: 13, fontWeight: 500, cursor: "pointer" };
const btnPrimary = { background: COLORS.steel, color: COLORS.paper, border: "none", padding: "9px 16px", borderRadius: 5, fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnDanger = { background: "transparent", border: `1px solid ${COLORS.rust}`, color: COLORS.rust, padding: "9px 16px", borderRadius: 5, fontSize: 13, fontWeight: 500, cursor: "pointer" };
const labelSmall = { fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: COLORS.textMute };

function ProjectModal({ initial, onClose, onSave, currentUser }) {
  const isEdit = !!initial;
  const [po, setPo] = useState(initial?.po || "");
  const [name, setName] = useState(initial?.name || "");
  const [client, setClient] = useState(initial?.client || "");
  const [supervisor, setSupervisor] = useState(initial?.supervisor || "");
  const [siteType, setSiteType] = useState(initial?.siteType || "workshop");
  const [site, setSite] = useState(initial?.site || "");
  const [stages, setStages] = useState(initial?.stages || []);
  const [notes, setNotes] = useState(initial?.notes || "");
  const [error, setError] = useState("");

  const handleSave = () => {
    if (!po.trim() || !name.trim()) { setError("PO number and project name are required."); return; }
    const base = {
      ...(initial || {}),
      po: po.trim(), name: name.trim(), client: client.trim(), supervisor: supervisor.trim(),
      siteType, site: site.trim(), stages, notes: notes.trim(),
      column: initial?.column || "estimation",
      updatedBy: currentUser || "Unknown",
    };
    onSave(base, isEdit);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,31,35,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.white, borderRadius: 8, width: "100%", maxWidth: 560, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "18px 22px 14px", borderBottom: `1px solid ${COLORS.line}` }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{isEdit ? "Edit project" : "New project"}</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 22, lineHeight: 1, color: COLORS.textMute, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: "18px 22px", overflowY: "auto", flex: 1 }}>
          <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
            <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={labelSmall}>PO number *</span>
              <input value={po} onChange={(e) => setPo(e.target.value)} placeholder="e.g. PO-2026-114" style={inputStyle} />
            </label>
            <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={labelSmall}>Project name *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aftout Essahili" style={inputStyle} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
            <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={labelSmall}>Client</span>
              <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. RAZEL-BEC" style={inputStyle} />
            </label>
            <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={labelSmall}>Supervisor</span>
              <input value={supervisor} onChange={(e) => setSupervisor(e.target.value)} placeholder="Name responsible" style={inputStyle} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
            <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={labelSmall}>Project type</span>
              <select value={siteType} onChange={(e) => setSiteType(e.target.value)} style={inputStyle}>
                <option value="workshop">Workshop (internal)</option>
                <option value="external">External / site</option>
              </select>
            </label>
            <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={labelSmall}>Site / location</span>
              <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="e.g. Béni Nadji" disabled={siteType === "workshop"} style={inputStyle} />
            </label>
          </div>
          <div style={{ marginBottom: 16 }}>
            <span style={labelSmall}>Stages for this project</span>
            <p style={{ fontSize: 12, color: COLORS.textMute, margin: "4px 0 6px" }}>Pick the stages that apply, in order. You can add custom ones too.</p>
            <StagePicker selected={stages} onChange={setStages} />
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            <span style={labelSmall}>Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional context…" style={{ ...inputStyle, resize: "vertical" }} />
          </label>
          {error && <div style={{ color: COLORS.rust, fontSize: 12.5, background: "#F7E9E2", border: `1px solid ${COLORS.rust}`, borderRadius: 4, padding: "8px 10px" }}>{error}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: `1px solid ${COLORS.line}` }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={handleSave} style={btnPrimary}>{isEdit ? "Save changes" : "Create project"}</button>
        </div>
      </div>
    </div>
  );
}

function NameGate({ onSet }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,31,35,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
      <div style={{ background: COLORS.white, borderRadius: 8, width: "100%", maxWidth: 380 }}>
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${COLORS.line}` }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Who's updating?</h2>
        </div>
        <div style={{ padding: "18px 22px" }}>
          <p style={{ fontSize: 12, color: COLORS.textMute, margin: "0 0 10px" }}>Enter your name so updates are tracked correctly.</p>
          <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder="e.g. Imed TLAHIG"
            onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) onSet(val.trim()); }} style={inputStyle} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "14px 22px", borderTop: `1px solid ${COLORS.line}` }}>
          <button disabled={!val.trim()} onClick={() => onSet(val.trim())} style={{ ...btnPrimary, opacity: val.trim() ? 1 : 0.5, cursor: val.trim() ? "pointer" : "not-allowed" }}>Continue</button>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ p, onOpen, onAdvanceColumn, onCycleStage }) {
  const doneCount = (p.stages || []).filter((s) => s.status === "done").length;
  const totalStages = (p.stages || []).length;
  const pct = totalStages ? Math.round((doneCount / totalStages) * 100) : 0;
  return (
    <div onClick={() => onOpen(p)} style={{ background: COLORS.paper, border: `1px solid ${COLORS.line}`, borderRadius: 5, padding: "13px 14px", cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontFamily: "monospace", fontSize: 11.5, fontWeight: 600, color: COLORS.steel, background: "#E3E0D5", padding: "2px 7px", borderRadius: 3 }}>{p.po}</span>
        {p.siteType === "external" && <span style={{ fontSize: 10, fontWeight: 600, color: COLORS.rust, letterSpacing: 0.6, border: `1px solid ${COLORS.rust}`, padding: "1px 6px", borderRadius: 3 }}>EXTERNAL</span>}
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px", lineHeight: 1.3 }}>{p.name}</h3>
      {p.client && <div style={{ fontSize: 12, color: COLORS.textMute, marginBottom: 2 }}>{p.client}</div>}
      {p.site && <div style={{ fontSize: 12, color: COLORS.textMute, marginBottom: 8 }}>📍 {p.site}</div>}
      {p.column === "ongoing" && (
        <>
          <StagePipeline stages={p.stages} onCycle={(idx) => onCycleStage(p, idx)} editable={true} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <div style={{ flex: 1, height: 5, background: COLORS.paper2, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", background: COLORS.green, width: pct + "%" }} />
            </div>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.textMute, minWidth: 30, textAlign: "right" }}>{pct}%</span>
          </div>
        </>
      )}
      {p.column === "archive" && (
        <div style={{ margin: "8px 0 4px" }}>
          <span style={{ display: "block", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: COLORS.textMute }}>Delivery PO date</span>
          <span style={{ display: "block", fontSize: 13, fontWeight: 500, marginTop: 1 }}>{fmtDate(p.deliveryPoDate)}</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLORS.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Avatar name={p.updatedBy} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>{p.updatedBy || "—"}</span>
            <span style={{ fontSize: 10.5, color: COLORS.textMute }}>{fmtDateTime(p.updatedAt)}</span>
          </div>
        </div>
        {p.column !== "archive" && (
          <button onClick={(e) => { e.stopPropagation(); onAdvanceColumn(p); }} style={{ background: COLORS.steel, color: COLORS.paper, border: "none", fontSize: 11.5, fontWeight: 600, padding: "6px 10px", borderRadius: 4, cursor: "pointer" }}>
            {p.column === "estimation" ? "Approve →" : "Close →"}
          </button>
        )}
      </div>
    </div>
  );
}

const metaK = { display: "block", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: COLORS.textMute };
const metaV = { display: "block", fontSize: 13, fontWeight: 500, marginTop: 1 };

function ProjectDrawer({ p, onClose, onSave, onDelete, onAdvanceColumn, onCycleStage, currentUser }) {
  const [editing, setEditing] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState(p.deliveryPoDate || "");
  if (editing) {
    return <ProjectModal initial={p} onClose={() => setEditing(false)} onSave={(updated) => { onSave(updated); setEditing(false); }} currentUser={currentUser} />;
  }
  const doneCount = (p.stages || []).filter((s) => s.status === "done").length;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,31,35,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.white, borderRadius: 8, width: "100%", maxWidth: 680, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "18px 22px 14px", borderBottom: `1px solid ${COLORS.line}` }}>
          <div>
            <span style={{ fontFamily: "monospace", fontSize: 11.5, fontWeight: 600, color: COLORS.steel, background: "#E3E0D5", padding: "2px 7px", borderRadius: 3 }}>{p.po}</span>
            <h2 style={{ fontSize: 19, margin: "2px 0 0" }}>{p.name}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 22, lineHeight: 1, color: COLORS.textMute, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: "18px 22px", overflowY: "auto", flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px", marginBottom: 18 }}>
            <div><span style={metaK}>Client</span><span style={metaV}>{p.client || "—"}</span></div>
            <div><span style={metaK}>Supervisor</span><span style={metaV}>{p.supervisor || "—"}</span></div>
            <div><span style={metaK}>Type</span><span style={metaV}>{p.siteType === "external" ? "External / site" : "Workshop"}</span></div>
            <div><span style={metaK}>Site</span><span style={metaV}>{p.site || "—"}</span></div>
            <div><span style={metaK}>Created</span><span style={metaV}>{fmtDate(p.createdAt?.slice(0, 10))}</span></div>
            {p.approvedAt && <div><span style={metaK}>Approved</span><span style={metaV}>{fmtDate(p.approvedAt.slice(0, 10))}</span></div>}
            {p.closedAt && <div><span style={metaK}>Closed</span><span style={metaV}>{fmtDate(p.closedAt.slice(0, 10))}</span></div>}
          </div>
          {p.column === "archive" && (
            <div style={{ marginBottom: 16 }}>
              <span style={labelSmall}>Delivery PO date</span>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => onSave({ ...p, deliveryPoDate: deliveryDate })} style={btnGhost}>Save date</button>
              </div>
            </div>
          )}
          {p.column === "ongoing" && (
            <div style={{ marginBottom: 16 }}>
              <span style={labelSmall}>Stages — {doneCount}/{p.stages.length} done · click to advance</span>
              <StagePipeline stages={p.stages} onCycle={(idx) => onCycleStage(p, idx)} editable={true} />
            </div>
          )}
          {p.notes && (
            <div style={{ marginBottom: 16 }}>
              <span style={labelSmall}>Notes</span>
              <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: "6px 0 0", background: COLORS.paper, padding: "10px 12px", borderRadius: 5 }}>{p.notes}</p>
            </div>
          )}
          <div>
            <span style={labelSmall}>Activity</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13 }}>
                <Avatar name={p.updatedBy} />
                <div><div><strong>{p.updatedBy || "—"}</strong> updated this project</div><div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 1 }}>{fmtDateTime(p.updatedAt)}</div></div>
              </div>
              {(p.history || []).slice().reverse().slice(0, 8).map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13 }}>
                  <Avatar name={h.by} />
                  <div><div><strong>{h.by}</strong> {h.action}</div><div style={{ fontSize: 11, color: COLORS.textMute, marginTop: 1 }}>{fmtDateTime(h.at)}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 22px", borderTop: `1px solid ${COLORS.line}` }}>
          <button onClick={() => { if (confirm("Delete this project? This cannot be undone.")) { onDelete(p.id); onClose(); } }} style={btnDanger}>Delete</button>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setEditing(true)} style={btnGhost}>Edit details</button>
            {p.column !== "archive" && (
              <button onClick={() => { onAdvanceColumn(p); onClose(); }} style={btnPrimary}>
                {p.column === "estimation" ? "Approve & move to Ongoing" : "Close & archive"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [projects, setProjects] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [openProject, setOpenProject] = useState(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("sea_tracker_user") : null;
    if (saved) setCurrentUser(saved);
  }, []);

  const loadAll = useCallback(async () => {
    const { data, error } = await supabase.from("projects").select("*").order("updated_at", { ascending: false });
    if (!error && data) setProjects(data.map(fromRow));
  }, []);

  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel("projects-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => { loadAll(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadAll]);

  const setUser = (name) => {
    window.localStorage.setItem("sea_tracker_user", name);
    setCurrentUser(name);
  };

  const addHistory = (p, action, who) => {
    const hist = (p.history || []).slice(-19);
    hist.push({ by: who, action, at: new Date().toISOString() });
    return hist;
  };

  const handleCreate = async (proj) => {
    const withHist = { ...proj, history: addHistory(proj, "created the project", currentUser) };
    const row = toRow(withHist);
    await supabase.from("projects").insert(row);
    setShowModal(false);
    loadAll();
  };

  const handleUpdate = async (updated) => {
    const prev = (projects || []).find((p) => p.id === updated.id) || updated;
    const withHist = { ...updated, updatedBy: currentUser, history: addHistory(prev, "edited project details", currentUser) };
    const row = toRow(withHist);
    await supabase.from("projects").update(row).eq("id", updated.id);
    setOpenProject(withHist);
    loadAll();
  };

  const handleDelete = async (id) => {
    await supabase.from("projects").delete().eq("id", id);
    loadAll();
  };

  const handleAdvanceColumn = async (p) => {
    const now = new Date().toISOString();
    let updated = { ...p, updatedBy: currentUser };
    if (p.column === "estimation") { updated.column = "ongoing"; updated.approvedAt = now; updated.history = addHistory(p, "approved — moved to Ongoing", currentUser); }
    else if (p.column === "ongoing") { updated.column = "archive"; updated.closedAt = now; updated.history = addHistory(p, "closed — moved to Archive", currentUser); }
    const row = toRow(updated);
    await supabase.from("projects").update(row).eq("id", p.id);
    if (openProject && openProject.id === p.id) setOpenProject(updated);
    loadAll();
  };

  const handleCycleStage = async (p, idx) => {
    const stages = p.stages.map((s, i) => {
      if (i !== idx) return s;
      const next = STAGE_STATUS[(STAGE_STATUS.indexOf(s.status) + 1) % STAGE_STATUS.length];
      return { ...s, status: next };
    });
    const changedStage = p.stages[idx];
    const updated = { ...p, stages, updatedBy: currentUser, history: addHistory(p, `updated stage "${changedStage?.name}"`, currentUser) };
    const row = toRow(updated);
    await supabase.from("projects").update(row).eq("id", p.id);
    if (openProject && openProject.id === p.id) setOpenProject(updated);
    loadAll();
  };

  if (!currentUser) return <NameGate onSet={setUser} />;
  if (projects === null) return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.textMute, fontFamily: "sans-serif" }}>Loading projects…</div>;

  const filtered = projects.filter((p) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return p.po.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (p.client || "").toLowerCase().includes(q);
  });
  const byColumn = (col) => filtered.filter((p) => p.column === col);
  const totalActive = projects.filter((p) => p.column !== "archive").length;
  const totalDone = projects.filter((p) => p.column === "archive").length;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: COLORS.paper, fontFamily: "sans-serif", color: COLORS.text }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 24px", background: COLORS.steelDark, color: COLORS.paper, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, background: COLORS.amber, color: COLORS.steelDark, fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4 }}>SEA</div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Workshop Project Tracker</span>
            <span style={{ fontSize: 11.5, color: "#9DA59C" }}>Nouakchott · live board</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontFamily: "monospace", fontSize: 19, fontWeight: 600, color: COLORS.amber }}>{totalActive}</span>
            <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.8, color: "#9DA59C" }}>active</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontFamily: "monospace", fontSize: 19, fontWeight: 600, color: COLORS.amber }}>{totalDone}</span>
            <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.8, color: "#9DA59C" }}>archived</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input placeholder="Search PO, name, client…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ background: "#2A3239", border: "1px solid #3C4750", color: COLORS.paper, padding: "8px 12px", borderRadius: 4, fontSize: 13, width: 200 }} />
          <button onClick={() => { window.localStorage.removeItem("sea_tracker_user"); setCurrentUser(null); }} title="Switch user" style={{ display: "flex", alignItems: "center", gap: 7, background: "transparent", border: "1px solid #3C4750", color: COLORS.paper, padding: "6px 12px 6px 6px", borderRadius: 20, fontSize: 13, cursor: "pointer" }}>
            <Avatar name={currentUser} /> <span>{currentUser}</span>
          </button>
          <button onClick={() => setShowModal(true)} style={btnPrimary}>+ New project</button>
        </div>
      </header>

      <div style={{ background: COLORS.paper2, borderBottom: `1px solid ${COLORS.line}`, padding: "7px 24px", fontSize: 12, color: COLORS.textMute, display: "flex", alignItems: "center", gap: 7, fontFamily: "monospace" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.green, display: "inline-block" }} />
        Live — connected to shared database, updates sync instantly across everyone's screen
      </div>

      <main style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr", gap: 18, padding: "20px 24px 40px", alignItems: "start" }}>
        {COLUMNS.map((col) => (
          <section key={col} style={{ background: COLORS.white, border: `1px solid ${COLORS.line}`, borderRadius: 6, minHeight: 200, display: "flex", flexDirection: "column", borderTop: `4px solid ${col === "estimation" ? "#8E94A0" : col === "ongoing" ? COLORS.amber : COLORS.green}` }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "16px 18px 0" }}>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: 0.3 }}>{COLUMN_META[col].title}</h2>
              <span style={{ fontFamily: "monospace", fontSize: 13, color: COLORS.textMute, background: COLORS.paper2, padding: "2px 8px", borderRadius: 10 }}>{byColumn(col).length}</span>
            </div>
            <p style={{ fontSize: 12, color: COLORS.textMute, margin: "4px 18px 14px" }}>{COLUMN_META[col].sub}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 14px 16px", flex: 1 }}>
              {byColumn(col).length === 0 && (
                <div style={{ fontSize: 13, color: COLORS.textMute, border: `1.5px dashed ${COLORS.line}`, borderRadius: 6, padding: "18px 14px", textAlign: "center", lineHeight: 1.5 }}>
                  {col === "estimation" ? "No projects in estimation. Click “+ New project” to add one." : "Nothing here yet."}
                </div>
              )}
              {byColumn(col).map((p) => (
                <ProjectCard key={p.id} p={p} onOpen={setOpenProject} onAdvanceColumn={handleAdvanceColumn} onCycleStage={handleCycleStage} />
              ))}
            </div>
          </section>
        ))}
      </main>

      {showModal && <ProjectModal onClose={() => setShowModal(false)} onSave={handleCreate} currentUser={currentUser} />}
      {openProject && (
        <ProjectDrawer
          p={projects.find((x) => x.id === openProject.id) || openProject}
          onClose={() => setOpenProject(null)}
          onSave={handleUpdate}
          onDelete={handleDelete}
          onAdvanceColumn={handleAdvanceColumn}
          onCycleStage={handleCycleStage}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
