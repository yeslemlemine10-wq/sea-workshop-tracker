import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

const COLUMNS = ["evaluation", "ongoing", "archive"];
const COLUMN_META = {
  evaluation: { title: "Evaluation", sub: "PRQ — technical & commercial offer in progress" },
  ongoing: { title: "Ongoing", sub: "Approved — work in progress" },
  archive: { title: "Archive", sub: "Closed, delivered, or not awarded" },
};

const EVAL_STAGE_LIBRARY = [
  "PRQ", "Site Visit", "External Technical Consultation", "Proposed Execution Plan",
  "Planning", "Technical Estimation", "Quoted", "Waiting Client / Negotiation", "Approval",
];
const ONGOING_STAGE_LIBRARY = [
  "Engineering", "Procurement", "Fabrication", "Welding",
  "Sandblasting", "Painting", "Civil Work", "Mobilization",
  "Erecting", "Delivery",
];
const STAGE_STATUS = ["pending", "active", "done"];
const STAGE_STATUS_LABEL = { pending: "On Hold", active: "On Going", done: "Done" };

// ---- SEA Engineering brand palette: black / white / green ----
const COLORS = {
  black: "#111315",
  blackSoft: "#1C1F22",
  white: "#FFFFFF",
  paper: "#F6F7F6",
  paper2: "#EAEDEA",
  green: "#1F7A3D",
  greenDark: "#155A2C",
  greenLight: "#E3F3E8",
  amber: "#C98A1F",
  amberLight: "#FBF0DD",
  rust: "#B3402C",
  rustLight: "#F8E6E1",
  line: "#DBDFDB",
  text: "#16181A",
  textMute: "#666B66",
};
const STAGE_DOT = { pending: COLORS.rust, active: COLORS.amber, done: COLORS.green };
const STAGE_BG = { pending: COLORS.rustLight, active: COLORS.amberLight, done: COLORS.greenLight };

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
const todayStr = () => new Date().toISOString().slice(0, 10);

function fromRow(r) {
  return {
    id: r.id, po: r.po, name: r.name, client: r.client || "", supervisor: r.supervisor || "",
    siteType: r.site_type || "workshop", site: r.site || "", notes: r.notes || "",
    column: r.column_name, stages: r.stages || [],
    dnNumber: r.dn_number || "", dnDate: r.dn_date || "",
    invoiceNumber: r.invoice_number || "", invoiceCommunicated: !!r.invoice_communicated,
    attachments: r.attachments || [], blockingIssues: r.blocking_issues || [],
    history: r.history || [], createdAt: r.created_at, approvedAt: r.approved_at,
    closedAt: r.closed_at, updatedAt: r.updated_at, updatedBy: r.updated_by,
    awarded: r.awarded !== false,
  };
}
function toRow(p) {
  return {
    po: p.po, name: p.name, client: p.client, supervisor: p.supervisor,
    site_type: p.siteType, site: p.site, notes: p.notes, column_name: p.column,
    stages: p.stages, dn_number: p.dnNumber, dn_date: p.dnDate,
    invoice_number: p.invoiceNumber, invoice_communicated: p.invoiceCommunicated,
    attachments: p.attachments || [], blocking_issues: p.blockingIssues || [],
    history: p.history, approved_at: p.approvedAt, closed_at: p.closedAt,
    updated_at: new Date().toISOString(), updated_by: p.updatedBy,
  };
}

function Avatar({ name, size = 26 }) {
  const initials = (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", background: COLORS.black, color: COLORS.white, fontSize: size * 0.4, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {initials || "?"}
    </span>
  );
}

function Logo({ size = 38 }) {
  return <img src="/logo.png" alt="SEA Engineering logo" style={{ height: size, width: "auto", objectFit: "contain" }} />;
}

function StageBar({ stage, onCycle, editable }) {
  const pct = stage.status === "done" ? 100 : stage.status === "active" ? (stage.pct ?? 50) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 12, width: 140, flexShrink: 0, color: COLORS.text }}>{stage.name}</span>
      <div style={{ flex: 1, height: 14, background: COLORS.paper2, borderRadius: 3, overflow: "hidden", position: "relative" }}>
        <div style={{ height: "100%", background: STAGE_DOT[stage.status], width: pct + "%", transition: "width 0.2s" }} />
      </div>
      <span style={{ fontSize: 11, color: COLORS.textMute, width: 32, textAlign: "right", flexShrink: 0 }}>{pct}%</span>
      <button
        onClick={(e) => { e.stopPropagation(); if (editable) onCycle(); }}
        disabled={!editable}
        style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 9px", borderRadius: 10, border: "none", background: STAGE_BG[stage.status], color: stage.status === "done" ? COLORS.greenDark : stage.status === "active" ? "#7A5610" : COLORS.rust, cursor: editable ? "pointer" : "default", width: 70, flexShrink: 0 }}>
        {STAGE_STATUS_LABEL[stage.status]}
      </button>
    </div>
  );
}

function StagePipelineCompact({ stages }) {
  if (!stages || stages.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "8px 0 4px" }}>
      {stages.map((s, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 5, background: COLORS.white, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: "3px 9px 3px 6px", fontSize: 11, fontWeight: 500, color: COLORS.text }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: STAGE_DOT[s.status], flexShrink: 0 }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

function StagePicker({ library, selected, onChange }) {
  const [custom, setCustom] = useState("");
  const toggle = (name) => {
    const exists = selected.find((s) => s.name === name);
    if (exists) onChange(selected.filter((s) => s.name !== name));
    else onChange([...selected, { name, status: "pending" }]);
  };
  const addCustom = () => {
    const v = custom.trim();
    if (!v) return;
    if (!selected.find((s) => s.name.toLowerCase() === v.toLowerCase())) onChange([...selected, { name: v, status: "pending" }]);
    setCustom("");
  };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
        {library.map((name) => {
          const on = !!selected.find((s) => s.name === name);
          return (
            <button type="button" key={name} onClick={() => toggle(name)} style={{ border: `1px solid ${on ? COLORS.green : COLORS.line}`, background: on ? COLORS.green : COLORS.paper, color: on ? COLORS.white : COLORS.text, borderRadius: 14, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
              {name}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input placeholder="Add custom step…" value={custom} onChange={(e) => setCustom(e.target.value)}
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
const btnGreen = { background: COLORS.green, color: COLORS.white, border: "none", padding: "9px 16px", borderRadius: 5, fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnDanger = { background: "transparent", border: `1px solid ${COLORS.rust}`, color: COLORS.rust, padding: "9px 16px", borderRadius: 5, fontSize: 13, fontWeight: 500, cursor: "pointer" };
const labelSmall = { fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: COLORS.textMute };

function ConfirmDialog({ title, message, onConfirm, onCancel }) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(17,19,21,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 200 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.white, borderRadius: 8, width: "100%", maxWidth: 380, padding: "20px 22px" }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>{title}</h3>
        <p style={{ fontSize: 13.5, color: COLORS.textMute, margin: "0 0 18px" }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onCancel} style={btnGhost}>Cancel</button>
          <button onClick={onConfirm} style={btnGreen}>Yes, confirm</button>
        </div>
      </div>
    </div>
  );
}

function NameGate({ onSet }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: COLORS.black, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
      <div style={{ background: COLORS.white, borderRadius: 8, width: "100%", maxWidth: 400, overflow: "hidden" }}>
        <div style={{ background: COLORS.black, padding: "26px 22px 20px", textAlign: "center" }}>
          <Logo size={56} />
          <p style={{ color: COLORS.white, fontSize: 15, fontWeight: 600, margin: "12px 0 2px" }}>Welcome to SEA Engineering</p>
          <p style={{ color: "#9AA39B", fontSize: 12.5, margin: 0 }}>Project Progress Live Dashboard</p>
        </div>
        <div style={{ padding: "18px 22px 14px" }}>
          <p style={{ fontSize: 12, color: COLORS.textMute, margin: "0 0 10px" }}>Enter your name so updates are tracked correctly.</p>
          <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder="e.g. Daouda SOW"
            onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) onSet(val.trim()); }} style={inputStyle} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "14px 22px", borderTop: `1px solid ${COLORS.line}` }}>
          <button disabled={!val.trim()} onClick={() => onSet(val.trim())} style={{ ...btnGreen, opacity: val.trim() ? 1 : 0.5, cursor: val.trim() ? "pointer" : "not-allowed" }}>Continue</button>
        </div>
      </div>
    </div>
  );
}

function ManpowerWidget({ entries, onOpenEditor }) {
  const today = todayStr();
  const todays = entries.filter((e) => e.log_date === today);
  const workshop = todays.filter((e) => e.is_workshop);
  const site = todays.filter((e) => !e.is_workshop);
  const sum = (arr, key) => arr.reduce((a, e) => a + (e[key] || 0), 0);
  const wsTotal = sum(workshop, "expat_count") + sum(workshop, "local_count");
  const siteTotal = sum(site, "expat_count") + sum(site, "local_count");

  return (
    <div onClick={onOpenEditor} style={{ background: COLORS.white, border: `1px solid ${COLORS.line}`, borderRadius: 6, padding: "14px 16px", marginBottom: 18, cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>ManPower on — {fmtDate(today)}</span>
        <span style={{ fontSize: 11.5, color: COLORS.green, fontWeight: 600 }}>Click to update →</span>
      </div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div>
          <span style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 700, color: COLORS.black }}>{wsTotal}</span>
          <span style={{ fontSize: 11.5, color: COLORS.textMute, marginLeft: 6 }}>in workshop</span>
        </div>
        {workshop.map((s) => (
          <div key={s.id} style={{ fontSize: 11.5, color: COLORS.textMute, alignSelf: "center" }}>
            <strong style={{ color: COLORS.text }}>{s.location}</strong>: {s.expat_count} exp · {s.local_count} loc
          </div>
        ))}
        <div>
          <span style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 700, color: COLORS.green }}>{siteTotal}</span>
          <span style={{ fontSize: 11.5, color: COLORS.textMute, marginLeft: 6 }}>on external sites</span>
        </div>
        {site.map((s) => (
          <div key={s.id} style={{ fontSize: 11.5, color: COLORS.textMute, alignSelf: "center" }}>
            <strong style={{ color: COLORS.text }}>{s.location}</strong>: {s.expat_count} exp · {s.local_count} loc
          </div>
        ))}
      </div>
    </div>
  );
}

function ManpowerEditor({ entries, onClose, onSave }) {
  const today = todayStr();
  const todays = entries.filter((e) => e.log_date === today);
  const [rows, setRows] = useState(
    todays.length ? todays.map((e) => ({ ...e })) : [{ location: "Workshop", expat_count: 0, local_count: 0, is_workshop: true }]
  );
  const addRow = () => setRows([...rows, { location: "", expat_count: 0, local_count: 0, is_workshop: false }]);
  const updateRow = (i, field, val) => setRows(rows.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));
  const removeRow = (i) => setRows(rows.filter((_, idx) => idx !== i));

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(17,19,21,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.white, borderRadius: 8, width: "100%", maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${COLORS.line}` }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Personnel — {fmtDate(today)}</h2>
          <p style={{ fontSize: 12, color: COLORS.textMute, margin: "4px 0 0" }}>One row per location. Check "Workshop" for internal, leave unchecked for site/external.</p>
        </div>
        <div style={{ padding: "16px 22px", overflowY: "auto", flex: 1 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <input value={r.location} onChange={(e) => updateRow(i, "location", e.target.value)} placeholder="Location (e.g. Sepco site, Beni Nadji)" style={{ ...inputStyle, flex: 2 }} />
              <input type="number" min="0" value={r.expat_count} onChange={(e) => updateRow(i, "expat_count", parseInt(e.target.value) || 0)} placeholder="Expat" style={{ ...inputStyle, flex: 1 }} />
              <input type="number" min="0" value={r.local_count} onChange={(e) => updateRow(i, "local_count", parseInt(e.target.value) || 0)} placeholder="Local" style={{ ...inputStyle, flex: 1 }} />
              <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={!!r.is_workshop} onChange={(e) => updateRow(i, "is_workshop", e.target.checked)} /> Workshop
              </label>
              <button onClick={() => removeRow(i)} style={{ background: "none", border: "none", color: COLORS.rust, fontSize: 16, cursor: "pointer" }}>×</button>
            </div>
          ))}
          <button onClick={addRow} style={btnGhost}>+ Add location</button>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: `1px solid ${COLORS.line}` }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={() => onSave(rows.filter((r) => r.location.trim()))} style={btnGreen}>Save</button>
        </div>
      </div>
    </div>
  );
}

function BlockingIssuesBanner({ projects, onOpen }) {
  const withIssues = projects.filter((p) => (p.blockingIssues || []).some((b) => !b.resolved));
  if (withIssues.length === 0) return null;
  return (
    <div style={{ background: COLORS.rustLight, border: `1.5px solid ${COLORS.rust}`, borderRadius: 6, padding: "12px 16px", marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.rust, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        ⚠ BLOCKING ISSUES — {withIssues.length} project{withIssues.length > 1 ? "s" : ""} need action
      </div>
      {withIssues.map((p) => {
        const openIssues = (p.blockingIssues || []).filter((b) => !b.resolved);
        return (
          <div key={p.id} onClick={() => onOpen(p)} style={{ cursor: "pointer", fontSize: 12.5, padding: "6px 0", borderTop: "1px solid #E8C5BC" }}>
            <strong>{p.po}</strong> — {p.name}: {openIssues.map((b) => b.text).join(" · ")}
          </div>
        );
      })}
    </div>
  );
}

function BlockingIssuesEditor({ issues, onChange }) {
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    onChange([...(issues || []), { id: uid(), text: text.trim(), action: "", resolved: false, by: "", at: new Date().toISOString() }]);
    setText("");
  };
  const update = (idx, field, val) => onChange(issues.map((b, i) => (i === idx ? { ...b, [field]: val } : b)));
  const remove = (idx) => onChange(issues.filter((_, i) => i !== idx));

  return (
    <div>
      {(issues || []).map((b, i) => (
        <div key={b.id || i} style={{ background: b.resolved ? COLORS.greenLight : COLORS.rustLight, border: `1px solid ${b.resolved ? COLORS.green : COLORS.rust}`, borderRadius: 5, padding: "8px 10px", marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>{b.text}</span>
            <button onClick={() => remove(i)} style={{ background: "none", border: "none", color: COLORS.textMute, cursor: "pointer", fontSize: 14 }}>×</button>
          </div>
          <input placeholder="Action taken / ongoing — and by who" value={b.action} onChange={(e) => update(i, "action", e.target.value)} style={{ ...inputStyle, marginTop: 6, fontSize: 12 }} />
          <label style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
            <input type="checkbox" checked={!!b.resolved} onChange={(e) => update(i, "resolved", e.target.checked)} /> Resolved
          </label>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <input placeholder="Describe the blocking issue (e.g. forklift down, awaiting procurement)" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} style={inputStyle} />
        <button onClick={add} style={btnGhost}>Add</button>
      </div>
    </div>
  );
}

function AttachmentsEditor({ attachments, onChange }) {
  const [link, setLink] = useState("");
  const [label, setLabel] = useState("");
  const add = () => {
    if (!link.trim()) return;
    onChange([...(attachments || []), { id: uid(), label: label.trim() || "Attachment", url: link.trim() }]);
    setLink(""); setLabel("");
  };
  const remove = (i) => onChange(attachments.filter((_, idx) => idx !== i));
  return (
    <div>
      {(attachments || []).map((a, i) => (
        <div key={a.id || i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12.5 }}>
          <span>📎</span>
          <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.green, textDecoration: "underline" }}>{a.label}</a>
          <button onClick={() => remove(i)} style={{ background: "none", border: "none", color: COLORS.textMute, cursor: "pointer" }}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <input placeholder="Label (e.g. Site photo)" value={label} onChange={(e) => setLabel(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <input placeholder="Paste link (Drive, photo URL…)" value={link} onChange={(e) => setLink(e.target.value)} style={{ ...inputStyle, flex: 2 }} />
        <button onClick={add} style={btnGhost}>Add</button>
      </div>
    </div>
  );
}

function ProjectModal({ initial, defaultColumn, onClose, onSave, currentUser }) {
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
  const column = initial?.column || defaultColumn || "evaluation";
  const library = column === "evaluation" ? EVAL_STAGE_LIBRARY : ONGOING_STAGE_LIBRARY;

const handleSave = () => {
    if (!name.trim()) { setError("Project name is required."); return; }
    if (column !== "evaluation" && !po.trim()) { setError("PO number is required for this stage."); return; }
    const base = {
      ...(initial || {}),
      po: po.trim(), name: name.trim(), client: client.trim(), supervisor: supervisor.trim(),
      siteType, site: site.trim(), stages, notes: notes.trim(), column,
      updatedBy: currentUser || "Unknown",
    };
    onSave(base, isEdit);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(17,19,21,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.white, borderRadius: 8, width: "100%", maxWidth: 560, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "18px 22px 14px", borderBottom: `1px solid ${COLORS.line}` }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{isEdit ? "Edit project" : "New project"}</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 22, lineHeight: 1, color: COLORS.textMute, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: "18px 22px", overflowY: "auto", flex: 1 }}>
          <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
            <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={labelSmall}>{column === "evaluation" ? "PO number (if known)" : "PO number *"}</span>
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
            <span style={labelSmall}>{column === "evaluation" ? "Evaluation steps" : "Execution stages"}</span>
            <p style={{ fontSize: 12, color: COLORS.textMute, margin: "4px 0 6px" }}>Pick the steps that apply, in order. You can add custom ones too.</p>
            <StagePicker library={library} selected={stages} onChange={setStages} />
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            <span style={labelSmall}>Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional context…" style={{ ...inputStyle, resize: "vertical" }} />
          </label>
          {error && <div style={{ color: COLORS.rust, fontSize: 12.5, background: COLORS.rustLight, border: `1px solid ${COLORS.rust}`, borderRadius: 4, padding: "8px 10px" }}>{error}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: `1px solid ${COLORS.line}` }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={handleSave} style={btnGreen}>{isEdit ? "Save changes" : "Create project"}</button>
        </div>
      </div>
    </div>
  );
}
function AdvancePoModal({ project, onClose, onConfirm }) {
  const [po, setPo] = useState(project.po || "");
  const [error, setError] = useState("");
  const handleConfirm = () => {
    if (!po.trim()) { setError("PO number is required to move to Ongoing."); return; }
    onConfirm(po.trim());
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(17,19,21,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 200 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.white, borderRadius: 8, width: "100%", maxWidth: 400, padding: "20px 22px" }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>Move "{project.name}" to Ongoing</h3>
        <p style={{ fontSize: 13.5, color: COLORS.textMute, margin: "0 0 14px" }}>Enter the PO number before confirming this project as approved.</p>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
          <span style={labelSmall}>PO number *</span>
          <input autoFocus value={po} onChange={(e) => setPo(e.target.value)} placeholder="e.g. PO-2026-114" style={inputStyle} />
        </label>
        {error && <div style={{ color: COLORS.rust, fontSize: 12.5, background: COLORS.rustLight, border: `1px solid ${COLORS.rust}`, borderRadius: 4, padding: "8px 10px", marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={handleConfirm} style={btnGreen}>Confirm & move</button>
        </div>
      </div>
    </div>
  );
}
function CloseArchiveModal({ project, onClose, onConfirm }) {
  const [invoiceNumber, setInvoiceNumber] = useState(project.invoiceNumber || "");
  const [communicated, setCommunicated] = useState(!!project.invoiceCommunicated);
  const [error, setError] = useState("");
  const handleConfirm = () => {
    onConfirm(invoiceNumber.trim(), communicated);
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(17,19,21,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 200 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.white, borderRadius: 8, width: "100%", maxWidth: 400, padding: "20px 22px" }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>Close & archive "{project.name}"</h3>
        <p style={{ fontSize: 13.5, color: COLORS.textMute, margin: "0 0 14px" }}>Enter the invoice details before archiving this project.</p>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
          <span style={labelSmall}>Invoice number</span>
          <input autoFocus value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-2026-088" style={inputStyle} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          <span style={labelSmall}>Communicated to client?</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => setCommunicated(true)} style={{ ...btnGhost, flex: 1, background: communicated ? COLORS.green : COLORS.paper, color: communicated ? COLORS.white : COLORS.text, borderColor: communicated ? COLORS.green : COLORS.line }}>Yes</button>
            <button type="button" onClick={() => setCommunicated(false)} style={{ ...btnGhost, flex: 1, background: !communicated ? COLORS.rust : COLORS.paper, color: !communicated ? COLORS.white : COLORS.text, borderColor: !communicated ? COLORS.rust : COLORS.line }}>No</button>
          </div>
        </label>
        {error && <div style={{ color: COLORS.rust, fontSize: 12.5, background: COLORS.rustLight, border: `1px solid ${COLORS.rust}`, borderRadius: 4, padding: "8px 10px", marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={handleConfirm} style={btnGreen}>Confirm & archive</button>
        </div>
      </div>
    </div>
  );
}
function ProjectCard({ p, onOpen, onRequestAdvance }) {
  const doneCount = (p.stages || []).filter((s) => s.status === "done").length;
  const totalStages = (p.stages || []).length;
  const pct = totalStages ? Math.round((doneCount / totalStages) * 100) : 0;
  const hasOpenIssue = (p.blockingIssues || []).some((b) => !b.resolved);

  if (p.column === "archive") {
    return (
      <div onClick={() => onOpen(p)} style={{ background: COLORS.paper, border: `1px solid ${COLORS.line}`, borderRadius: 5, padding: "12px 14px", cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "monospace", fontSize: 11.5, fontWeight: 600, color: COLORS.black, background: COLORS.paper2, padding: "2px 7px", borderRadius: 3 }}>{p.po}</span>
          {p.awarded === false && <span style={{ fontSize: 10, fontWeight: 600, color: COLORS.textMute, border: `1px solid ${COLORS.line}`, padding: "1px 6px", borderRadius: 3 }}>NOT AWARDED</span>}
        </div>
       <h3 style={{ fontSize: 14.5, fontWeight: 500, margin: "6px 0 4px" }}>{p.name}</h3>
        <div style={{ fontSize: 12, color: COLORS.textMute }}>DN: {p.dnNumber || "—"} {p.dnDate ? `· ${fmtDate(p.dnDate)}` : ""}</div>
        <div style={{ fontSize: 12, color: COLORS.textMute, marginTop: 2 }}>
          Invoice: {p.invoiceNumber || "—"}{" "}
          {p.invoiceNumber && (
            <span style={{ fontSize: 10, fontWeight: 600, color: p.invoiceCommunicated ? COLORS.greenDark : COLORS.rust }}>
              ({p.invoiceCommunicated ? "communicated" : "not communicated"})
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div onClick={() => onOpen(p)} style={{ background: COLORS.paper, border: hasOpenIssue ? `1.5px solid ${COLORS.rust}` : `1px solid ${COLORS.line}`, borderRadius: 5, padding: "13px 14px", cursor: "pointer" }}>
      {hasOpenIssue && <div style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.rust, marginBottom: 6 }}>⚠ BLOCKING ISSUE</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontFamily: "monospace", fontSize: 11.5, fontWeight: 600, color: COLORS.black, background: COLORS.paper2, padding: "2px 7px", borderRadius: 3 }}>{p.po}</span>
        {p.siteType === "external" && <span style={{ fontSize: 10, fontWeight: 600, color: COLORS.rust, letterSpacing: 0.6, border: `1px solid ${COLORS.rust}`, padding: "1px 6px", borderRadius: 3 }}>EXTERNAL</span>}
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px", lineHeight: 1.3 }}>{p.name}</h3>
      {p.client && <div style={{ fontSize: 12, color: COLORS.textMute, marginBottom: 2 }}>{p.client}</div>}
      {p.site && <div style={{ fontSize: 12, color: COLORS.textMute, marginBottom: 8 }}>📍 {p.site}</div>}
      <StagePipelineCompact stages={p.stages} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
        <div style={{ flex: 1, height: 5, background: COLORS.paper2, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", background: COLORS.green, width: pct + "%" }} />
        </div>
        <span style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.textMute, minWidth: 30, textAlign: "right" }}>{pct}%</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLORS.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Avatar name={p.updatedBy} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>{p.updatedBy || "—"}</span>
            <span style={{ fontSize: 10.5, color: COLORS.textMute }}>{fmtDateTime(p.updatedAt)}</span>
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onRequestAdvance(p); }} style={{ background: COLORS.black, color: COLORS.white, border: "none", fontSize: 11.5, fontWeight: 600, padding: "6px 10px", borderRadius: 4, cursor: "pointer" }}>
          {p.column === "evaluation" ? "Approve →" : "Close →"}
        </button>
      </div>
    </div>
  );
}

const metaK = { display: "block", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: COLORS.textMute };
const metaV = { display: "block", fontSize: 13, fontWeight: 500, marginTop: 1 };

function ProjectDrawer({ p, onClose, onSave, onDelete, onRequestAdvance, onArchiveNotAwarded, onCycleStage, currentUser }) {
  const [editing, setEditing] = useState(false);
  const [dnNumber, setDnNumber] = useState(p.dnNumber || "");
  const [dnDate, setDnDate] = useState(p.dnDate || "");
  const [attachments, setAttachments] = useState(p.attachments || []);
  const [invoiceNumber, setInvoiceNumber] = useState(p.invoiceNumber || "");
  const [invoiceCommunicated, setInvoiceCommunicated] = useState(!!p.invoiceCommunicated);
  const [blockingIssues, setBlockingIssues] = useState(p.blockingIssues || []);
  
  if (editing) {
    return <ProjectModal initial={p} onClose={() => setEditing(false)} onSave={(updated) => { onSave(updated); setEditing(false); }} currentUser={currentUser} />;
  }

  const doneCount = (p.stages || []).filter((s) => s.status === "done").length;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(17,19,21,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.white, borderRadius: 8, width: "100%", maxWidth: 680, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "18px 22px 14px", borderBottom: `1px solid ${COLORS.line}` }}>
          <div>
            <span style={{ fontFamily: "monospace", fontSize: 11.5, fontWeight: 600, color: COLORS.black, background: COLORS.paper2, padding: "2px 7px", borderRadius: 3 }}>{p.po}</span>
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
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={labelSmall}>DN number</span>
                  <input value={dnNumber} onChange={(e) => setDnNumber(e.target.value)} style={inputStyle} />
                </label>
                <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={labelSmall}>DN date</span>
                  <input type="date" value={dnDate} onChange={(e) => setDnDate(e.target.value)} style={inputStyle} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={labelSmall}>Invoice number</span>
                  <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-2026-088" style={inputStyle} />
                </label>
                <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={labelSmall}>Communicated to client?</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => setInvoiceCommunicated(true)} style={{ ...btnGhost, flex: 1, background: invoiceCommunicated ? COLORS.green : COLORS.paper, color: invoiceCommunicated ? COLORS.white : COLORS.text, borderColor: invoiceCommunicated ? COLORS.green : COLORS.line }}>Yes</button>
                    <button type="button" onClick={() => setInvoiceCommunicated(false)} style={{ ...btnGhost, flex: 1, background: !invoiceCommunicated ? COLORS.rust : COLORS.paper, color: !invoiceCommunicated ? COLORS.white : COLORS.text, borderColor: !invoiceCommunicated ? COLORS.rust : COLORS.line }}>No</button>
                  </div>
                </label>
                <button onClick={() => onSave({ ...p, dnNumber, dnDate, invoiceNumber, invoiceCommunicated })} style={btnGhost}>Save</button>
              </div>
            </div>
          )}
          {p.column !== "archive" && (
            <div style={{ marginBottom: 16 }}>
              <span style={labelSmall}>{p.column === "evaluation" ? "Evaluation steps" : "Execution stages"} — {doneCount}/{(p.stages || []).length} done</span>
              <div style={{ marginTop: 8 }}>
                {(p.stages || []).map((s, i) => (
                  <StageBar key={i} stage={s} editable={true} onCycle={() => onCycleStage(p, i)} />
                ))}
                {(!p.stages || p.stages.length === 0) && <p style={{ fontSize: 12, color: COLORS.textMute, fontStyle: "italic" }}>No steps defined yet — edit project to add some.</p>}
              </div>
            </div>
          )}

          {p.column !== "archive" && (
            <div style={{ marginBottom: 16 }}>
              <span style={labelSmall}>Blocking issues</span>
              <p style={{ fontSize: 11.5, color: COLORS.textMute, margin: "4px 0 8px" }}>Visible to everyone on the board until resolved.</p>
              <BlockingIssuesEditor issues={blockingIssues} onChange={(v) => { setBlockingIssues(v); onSave({ ...p, blockingIssues: v }); }} />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <span style={labelSmall}>Attachments</span>
            <p style={{ fontSize: 11.5, color: COLORS.textMute, margin: "4px 0 8px" }}>Paste a link to a site photo or file (Drive, etc).</p>
            <AttachmentsEditor attachments={attachments} onChange={(v) => { setAttachments(v); onSave({ ...p, attachments: v }); }} />
          </div>

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
          <button onClick={() => onDelete(p)} style={btnDanger}>Delete</button>
          <div style={{ display: "flex", gap: 10 }}>
            {p.column === "evaluation" && (
              <button onClick={() => onArchiveNotAwarded(p)} style={btnGhost}>Archive — not awarded</button>
            )}
            <button onClick={() => setEditing(true)} style={btnGhost}>Edit details</button>
            {p.column !== "archive" && (
              <button onClick={() => onRequestAdvance(p)} style={btnGreen}>
                {p.column === "evaluation" ? "Approve & move to Ongoing" : "Close & archive"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function exportToExcel(projects) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Column", "PO Number", "Project Name", "Client", "Supervisor", "Type", "Site", "DN Number", "DN Date", "Progress %", "Updated By", "Updated On"]];
  projects.forEach((p) => {
    const done = (p.stages || []).filter((s) => s.status === "done").length;
    const total = (p.stages || []).length;
    const pct = total ? Math.round((done / total) * 100) : "";
    rows.push([p.column, p.po, p.name, p.client, p.supervisor, p.siteType, p.site, p.dnNumber, p.dnDate, pct, p.updatedBy, fmtDateTime(p.updatedAt)]);
  });
  const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `SEA_Workshop_Tracker_${todayStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [projects, setProjects] = useState(null);
  const [manpower, setManpower] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [createColumn, setCreateColumn] = useState("evaluation");
  const [openProject, setOpenProject] = useState(null);
  const [filter, setFilter] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);
  const [showManpowerEditor, setShowManpowerEditor] = useState(false);
  const [advancingProject, setAdvancingProject] = useState(null);
  const [closingProject, setClosingProject] = useState(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("sea_tracker_user") : null;
    if (saved) setCurrentUser(saved);
  }, []);

  const loadAll = useCallback(async () => {
    const { data, error } = await supabase.from("projects").select("*").order("updated_at", { ascending: false });
    if (!error && data) setProjects(data.map(fromRow));
    const { data: mp } = await supabase.from("manpower").select("*").order("log_date", { ascending: false }).limit(60);
    if (mp) setManpower(mp);
  }, []);

  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel("tracker-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "manpower" }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadAll]);

  const setUser = (name) => { window.localStorage.setItem("sea_tracker_user", name); setCurrentUser(name); };

  const addHistory = (p, action, who) => {
    const hist = (p.history || []).slice(-19);
    hist.push({ by: who, action, at: new Date().toISOString() });
    return hist;
  };

  const handleCreate = async (proj) => {
    const withHist = { ...proj, history: addHistory(proj, "created the project", currentUser) };
    await supabase.from("projects").insert(toRow(withHist));
    setShowModal(false);
    loadAll();
  };

  const handleUpdate = async (updated) => {
    const prev = (projects || []).find((p) => p.id === updated.id) || updated;
    const changedKeys = Object.keys(updated).filter((k) => JSON.stringify(updated[k]) !== JSON.stringify(prev[k]));
    let actionLabel = "edited project details";
    if (changedKeys.length === 1 && changedKeys[0] === "blockingIssues") actionLabel = "updated blocking issues";
    if (changedKeys.length === 1 && changedKeys[0] === "attachments") actionLabel = "updated attachments";
    const withHist = { ...updated, updatedBy: currentUser, history: addHistory(prev, actionLabel, currentUser) };
    await supabase.from("projects").update(toRow(withHist)).eq("id", updated.id);
    setOpenProject(withHist);
    loadAll();
  };

  const requestDelete = (p) => {
    setConfirmAction({
      title: "Delete this project?",
      message: `This will permanently remove ${p.po} — ${p.name}. This cannot be undone.`,
      onConfirm: async () => {
        await supabase.from("projects").delete().eq("id", p.id);
        setConfirmAction(null);
        setOpenProject(null);
        loadAll();
      },
    });
  };

const requestAdvance = (p) => {
    const isEval = p.column === "evaluation";
    if (isEval) {
      setAdvancingProject(p);
      return;
    }
    setClosingProject(p);
  };

  const handleConfirmCloseArchive = async (invoiceNumber, communicated) => {
    const p = closingProject;
    const now = new Date().toISOString();
    const updated = { ...p, invoiceNumber, invoiceCommunicated: communicated, column: "archive", closedAt: now, updatedBy: currentUser, history: addHistory(p, "closed — moved to Archive", currentUser) };
    await supabase.from("projects").update(toRow(updated)).eq("id", p.id);
    setClosingProject(null);
    if (openProject && openProject.id === p.id) setOpenProject(updated);
    loadAll();
  };
  const handleConfirmAdvanceToOngoing = async (po) => {
    const p = advancingProject;
    const now = new Date().toISOString();
    const updated = { ...p, po, column: "ongoing", approvedAt: now, stages: [], updatedBy: currentUser, history: addHistory(p, "approved — moved to Ongoing", currentUser) };
    await supabase.from("projects").update(toRow(updated)).eq("id", p.id);
    setAdvancingProject(null);
    if (openProject && openProject.id === p.id) setOpenProject(updated);
    loadAll();
  };

  const requestArchiveNotAwarded = (p) => {
    setConfirmAction({
      title: "Archive as not awarded?",
      message: `Confirm that ${p.po} — ${p.name} was not awarded by the client and should be archived without execution.`,
      onConfirm: async () => {
        const now = new Date().toISOString();
        const updated = { ...p, column: "archive", closedAt: now, updatedBy: currentUser, history: addHistory(p, "archived — not awarded", currentUser) };
        await supabase.from("projects").update({ ...toRow(updated), awarded: false }).eq("id", p.id);
        setConfirmAction(null);
        setOpenProject(null);
        loadAll();
      },
    });
  };

  const handleCycleStage = async (p, idx) => {
    const stages = p.stages.map((s, i) => {
      if (i !== idx) return s;
      const next = STAGE_STATUS[(STAGE_STATUS.indexOf(s.status) + 1) % STAGE_STATUS.length];
      return { ...s, status: next };
    });
    const changedStage = p.stages[idx];
    const updated = { ...p, stages, updatedBy: currentUser, history: addHistory(p, `updated "${changedStage?.name}" → ${STAGE_STATUS_LABEL[stages[idx].status]}`, currentUser) };
    await supabase.from("projects").update(toRow(updated)).eq("id", p.id);
    if (openProject && openProject.id === p.id) setOpenProject(updated);
    loadAll();
  };

  const saveManpower = async (rows) => {
    const today = todayStr();
    await supabase.from("manpower").delete().eq("log_date", today);
    const inserts = rows.map((r) => ({ log_date: today, location: r.location, expat_count: r.expat_count || 0, local_count: r.local_count || 0, is_workshop: !!r.is_workshop, updated_by: currentUser }));
    if (inserts.length) await supabase.from("manpower").insert(inserts);
    setShowManpowerEditor(false);
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
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 24px", background: COLORS.black, color: COLORS.white, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logo size={42} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Project Progress Live Dashboard</span>
            <span style={{ fontSize: 11.5, color: "#9AA39B" }}>Nouakchott · SEA Engineering</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontFamily: "monospace", fontSize: 19, fontWeight: 600, color: COLORS.green }}>{totalActive}</span>
            <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.8, color: "#9AA39B" }}>active</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontFamily: "monospace", fontSize: 19, fontWeight: 600, color: COLORS.green }}>{totalDone}</span>
            <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.8, color: "#9AA39B" }}>archived</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input placeholder="Search PO, name, client…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ background: "#262A26", border: "1px solid #3A3F3A", color: COLORS.white, padding: "8px 12px", borderRadius: 4, fontSize: 13, width: 190 }} />
          <button onClick={() => exportToExcel(projects)} style={{ ...btnGhost, background: "transparent", borderColor: "#3A3F3A", color: COLORS.white }}>Export ⤓</button>
          <button onClick={() => { window.localStorage.removeItem("sea_tracker_user"); setCurrentUser(null); }} title="Switch user" style={{ display: "flex", alignItems: "center", gap: 7, background: "transparent", border: "1px solid #3A3F3A", color: COLORS.white, padding: "6px 12px 6px 6px", borderRadius: 20, fontSize: 13, cursor: "pointer" }}>
            <Avatar name={currentUser} /> <span>{currentUser}</span>
          </button>
          <button onClick={() => { setCreateColumn("evaluation"); setShowModal(true); }} style={btnGreen}>+ New project</button>
        </div>
      </header>

      <div style={{ background: COLORS.paper2, borderBottom: `1px solid ${COLORS.line}`, padding: "7px 24px", fontSize: 12, color: COLORS.textMute, display: "flex", alignItems: "center", gap: 7, fontFamily: "monospace" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.green, display: "inline-block" }} />
        Live — connected to shared database, updates sync instantly across everyone's screen
      </div>

      <main style={{ flex: 1, padding: "20px 24px 40px" }}>
        <ManpowerWidget entries={manpower} onOpenEditor={() => setShowManpowerEditor(true)} />
        <BlockingIssuesBanner projects={projects} onOpen={setOpenProject} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr", gap: 18, alignItems: "start" }}>
          {COLUMNS.map((col) => (
            <section key={col} style={{ background: COLORS.white, border: `1px solid ${COLORS.line}`, borderRadius: 6, minHeight: 200, display: "flex", flexDirection: "column", borderTop: `4px solid ${col === "evaluation" ? COLORS.amber : col === "ongoing" ? COLORS.green : COLORS.black}` }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "16px 18px 0" }}>
                <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: 0.3 }}>{COLUMN_META[col].title}</h2>
                <span style={{ fontFamily: "monospace", fontSize: 13, color: COLORS.textMute, background: COLORS.paper2, padding: "2px 8px", borderRadius: 10 }}>{byColumn(col).length}</span>
              </div>
              <p style={{ fontSize: 12, color: COLORS.textMute, margin: "4px 18px 14px" }}>{COLUMN_META[col].sub}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 14px 16px", flex: 1 }}>
                {col === "evaluation" && (
                  <button onClick={() => { setCreateColumn("evaluation"); setShowModal(true); }} style={{ ...btnGhost, fontSize: 12 }}>+ New evaluation</button>
                )}
                {byColumn(col).length === 0 && (
                  <div style={{ fontSize: 13, color: COLORS.textMute, border: `1.5px dashed ${COLORS.line}`, borderRadius: 6, padding: "18px 14px", textAlign: "center", lineHeight: 1.5 }}>
                    Nothing here yet.
                  </div>
                )}
                {byColumn(col).map((p) => (
                  <ProjectCard key={p.id} p={p} onOpen={setOpenProject} onRequestAdvance={requestAdvance} />
                ))}
                {col === "evaluation" && byColumn("evaluation").length > 0 && (
                  <p style={{ fontSize: 11, color: COLORS.textMute, fontStyle: "italic", marginTop: 4 }}>
                    Not awarded? Open a project and use "Archive — not awarded" from its detail view.
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
      </main>

      {showModal && <ProjectModal defaultColumn={createColumn} onClose={() => setShowModal(false)} onSave={handleCreate} currentUser={currentUser} />}
      {openProject && (
        <ProjectDrawer
          p={projects.find((x) => x.id === openProject.id) || openProject}
          onClose={() => setOpenProject(null)}
          onSave={handleUpdate}
          onDelete={requestDelete}
          onRequestAdvance={requestAdvance}
          onArchiveNotAwarded={requestArchiveNotAwarded}
          onCycleStage={handleCycleStage}
          currentUser={currentUser}
        />
      )}
      {showManpowerEditor && (
        <ManpowerEditor entries={manpower} onClose={() => setShowManpowerEditor(false)} onSave={saveManpower} />
            
      )}
      {advancingProject && (
        <AdvancePoModal project={advancingProject} onClose={() => setAdvancingProject(null)} onConfirm={handleConfirmAdvanceToOngoing} />
      )}
      {closingProject && (
        <CloseArchiveModal project={closingProject} onClose={() => setClosingProject(null)} onConfirm={handleConfirmCloseArchive} />
      )}
      {confirmAction && (
        <ConfirmDialog title={confirmAction.title} message={confirmAction.message} onConfirm={confirmAction.onConfirm} onCancel={() => setConfirmAction(null)} />
      )}
    </div>
  );
}
