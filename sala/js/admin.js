import * as fb from "./firebase.js";
import { requireSession, logoutAndLeave } from "./session.js";
import { parseLink } from "./link-parser.js";
import { $, $$, esc, toast, hideLoading, hydrateIcons, coverHTML, ICON } from "./ui.js";

hydrateIcons();
const { user, profile } = await requireSession({ admin: true });
$("#user-chip").innerHTML = `Hola, <b>${esc((profile.name || "").split(" ")[0] || "admin")}</b>`;
$$("[data-logout]").forEach((b) => b.addEventListener("click", logoutAndLeave));

let guiones = [], materiales = [];
let parsed = null;          // resultado de parseLink del formulario
let editingId = null;       // id del material en edición
let tipoTocado = false;     // si el admin eligió el tipo a mano
const guionName = () => new Map(guiones.map((g) => [g.id, g.nombre]));

async function loadAll() {
  [guiones, materiales] = await Promise.all([fb.listGuiones(), fb.listMateriales()]);
}
function renderAll() { renderGuionSelects(); renderInstList(); renderMateriales(); renderGuiones(); renderImport(); }

// ---------- Pestañas ----------
function showTab(name) {
  $$("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  ["cargar", "material", "guiones"].forEach((t) => ($(`#tab-${t}`).hidden = t !== name));
}
$$("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

// ---------- Formulario: link ----------
const linkInput = $("#f-link");
let titleReq = 0;

async function fetchYoutubeTitle(p) {
  const my = ++titleReq;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(p.watchUrl)}&format=json`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (my === titleReq && data.title && !$("#f-titulo").value.trim()) {
      $("#f-titulo").value = data.title;
      $("#preview-title").textContent = data.title;
    }
  } catch { /* si falla, el título se escribe a mano */ }
}

function onLinkChange() {
  const raw = linkInput.value.trim();
  $("#link-error").textContent = "";
  parsed = null;
  $("#preview").hidden = true;
  if (!raw) return;
  const r = parseLink(raw);
  if (!r.ok) { $("#link-error").textContent = r.error; return; }
  parsed = r;
  $("#preview").hidden = false;
  $("#preview-cover").outerHTML = coverHTML({ tipo: currentTipo() }, r.thumb).replace('<div class="cover">', '<div class="cover" id="preview-cover">');
  $("#preview-service").textContent = r.servicio === "youtube" ? "YouTube" : "Google Drive";
  $("#preview-title").textContent = $("#f-titulo").value.trim() || "(sin título todavía)";
  $("#preview-hint").textContent = r.servicio === "drive" ? "Recordá compartir el archivo con “Cualquier persona con el enlace”." : "Listo para guardar.";
  if (!tipoTocado && !editingId) setTipo(r.servicio === "drive" ? "audio" : "video");
  if (r.servicio === "youtube" && !$("#f-titulo").value.trim()) fetchYoutubeTitle(r);
}
linkInput.addEventListener("input", onLinkChange);
linkInput.addEventListener("paste", () => setTimeout(onLinkChange, 0));

const currentTipo = () => $('input[name="tipo"]:checked')?.value || "video";
const setTipo = (t) => { const el = $(`input[name="tipo"][value="${t}"]`); if (el) el.checked = true; };
$$('input[name="tipo"]').forEach((r) => r.addEventListener("change", () => { tipoTocado = true; }));
$("#f-titulo").addEventListener("input", () => { if (parsed) $("#preview-title").textContent = $("#f-titulo").value.trim() || "(sin título todavía)"; });

// ---------- Formulario: guion / instrumento ----------
function renderGuionSelects() {
  const sel = $("#f-guion");
  const keep = sel.value;
  sel.innerHTML =
    `<option value="">Elegí un guion…</option>` +
    guiones.map((g) => `<option value="${esc(g.id)}">${esc(g.nombre)}</option>`).join("") +
    `<option value="__new">➕ Crear guion nuevo…</option>`;
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
  $("#new-guion-field").hidden = sel.value !== "__new";

  const lg = $("#l-guion"), keepL = lg.value || "all";
  lg.innerHTML = `<option value="all">Todos los guiones</option>` + guiones.map((g) => `<option value="${esc(g.id)}">${esc(g.nombre)}</option>`).join("");
  lg.value = [...lg.options].some((o) => o.value === keepL) ? keepL : "all";
}
$("#f-guion").addEventListener("change", () => {
  const isNew = $("#f-guion").value === "__new";
  $("#new-guion-field").hidden = !isNew;
  if (isNew) $("#f-new-guion").focus();
});
function renderInstList() {
  const insts = [...new Set(materiales.map((m) => (m.instrumento || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  $("#inst-list").innerHTML = insts.map((i) => `<option value="${esc(i)}">`).join("");
}

// ---------- Formulario: guardar ----------
function resetForm({ keepMeta = true } = {}) {
  const meta = { tipo: currentTipo(), guion: $("#f-guion").value, inst: $("#f-inst").value };
  $("#mat-form").reset();
  linkInput.value = ""; parsed = null; editingId = null; tipoTocado = false;
  $("#preview").hidden = true; $("#link-error").textContent = ""; $("#form-error").textContent = "";
  $("#form-title").textContent = "Nuevo material";
  $("#btn-save").textContent = "Guardar material";
  $("#btn-cancel-edit").hidden = true;
  $("#new-guion-field").hidden = true;
  if (keepMeta) {
    setTipo(meta.tipo);
    if (meta.guion && meta.guion !== "__new") $("#f-guion").value = meta.guion;
    $("#f-inst").value = meta.inst;
    if (meta.tipo) tipoTocado = true;
  }
}

$("#mat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#form-error");
  err.textContent = "";
  onLinkChange();
  if (!parsed) { err.textContent = $("#link-error").textContent || "Pegá un link válido."; return; }
  const titulo = $("#f-titulo").value.trim();
  if (!titulo) { err.textContent = "Ponele un título."; $("#f-titulo").focus(); return; }
  let guionId = $("#f-guion").value;
  if (!guionId) { err.textContent = "Elegí un guion (o creá uno nuevo)."; return; }

  if (!editingId) {
    const dup = materiales.find((m) => m.servicio === parsed.servicio && m.externalId === parsed.externalId);
    if (dup && !confirm(`Ese link ya está cargado como “${dup.titulo}”. ¿Cargarlo de nuevo igual?`)) return;
  }

  const btn = $("#btn-save");
  btn.disabled = true;
  try {
    if (guionId === "__new") {
      const nombre = $("#f-new-guion").value.trim();
      if (!nombre) { err.textContent = "Escribí el nombre del guion nuevo."; btn.disabled = false; return; }
      const existing = guiones.find((g) => g.nombre.toLowerCase() === nombre.toLowerCase());
      guionId = existing ? existing.id : await fb.saveGuion(null, { nombre });
    }
    const data = {
      tipo: currentTipo(), titulo, url: linkInput.value.trim(),
      servicio: parsed.servicio, externalId: parsed.externalId,
      guionId, instrumento: $("#f-inst").value.trim(), creadoPor: user.uid,
    };
    await fb.saveMaterial(editingId, data);
    const wasEditing = !!editingId;
    toast(wasEditing ? "Cambios guardados." : "Material guardado.");
    await loadAll();
    resetForm();
    renderAll();
    if (wasEditing) showTab("material");
    else linkInput.focus();
  } catch (e2) {
    console.error(e2);
    err.textContent = e2?.code === "permission-denied" ? "Firestore rechazó el guardado. Revisá las reglas y que tu usuario sea admin." : "No se pudo guardar. Intentá de nuevo.";
  } finally { btn.disabled = false; }
});
$("#btn-cancel-edit").addEventListener("click", () => resetForm({ keepMeta: false }));

// ---------- Lista de material ----------
function filteredMateriales() {
  const t = $("#l-tipo").value, g = $("#l-guion").value, q = $("#l-q").value.trim().toLowerCase();
  return materiales.filter((m) => (t === "all" || m.tipo === t) && (g === "all" || m.guionId === g) && (!q || `${m.titulo} ${m.instrumento || ""}`.toLowerCase().includes(q)));
}
function renderMateriales() {
  const names = guionName();
  $("#count-material").textContent = materiales.length;
  const list = filteredMateriales();
  $("#mat-list").innerHTML = list.length
    ? list.map((m, i) => `
      <div class="item" data-id="${esc(m.id)}">
        ${coverHTML(m, m.servicio === "youtube" ? `https://i.ytimg.com/vi/${m.externalId}/mqdefault.jpg` : null)}
        <div class="item-main">
          <b>${esc(m.titulo)}</b>
          <span>${m.tipo === "audio" ? "Audio" : "Video"} · ${m.servicio === "youtube" ? "YouTube" : "Drive"} · ${esc(names.get(m.guionId) || "Sin guion")}${m.instrumento ? ` · ${esc(m.instrumento)}` : ""}</span>
        </div>
        <div class="item-actions">
          <button class="btn-icon" data-act="up" ${i === 0 ? "disabled" : ""} aria-label="Subir" type="button">${ICON.up}</button>
          <button class="btn-icon" data-act="down" ${i === list.length - 1 ? "disabled" : ""} aria-label="Bajar" type="button">${ICON.down}</button>
          <button class="btn-icon" data-act="edit" aria-label="Editar" type="button">${ICON.edit}</button>
          <button class="btn-icon" data-act="del" aria-label="Eliminar" type="button" style="color:var(--danger)">${ICON.trash}</button>
        </div>
      </div>`).join("")
    : `<div class="empty">Todavía no hay material${materiales.length ? " con esos filtros" : ""}.</div>`;
}
["#l-tipo", "#l-guion"].forEach((s) => $(s).addEventListener("change", renderMateriales));
$("#l-q").addEventListener("input", renderMateriales);

$("#mat-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const id = btn.closest(".item").dataset.id;
  const m = materiales.find((x) => x.id === id);
  const act = btn.dataset.act;
  try {
    if (act === "del") {
      if (!confirm(`¿Eliminar “${m.titulo}”? Esto no se puede deshacer.`)) return;
      await fb.deleteMaterial(id);
      toast("Eliminado.");
    } else if (act === "edit") {
      startEdit(m);
      return;
    } else {
      const list = filteredMateriales();
      const i = list.findIndex((x) => x.id === id);
      const other = list[act === "up" ? i - 1 : i + 1];
      if (!other) return;
      // intercambiar `orden` (la lista va de mayor a menor)
      await Promise.all([fb.patchMaterial(m.id, { orden: other.orden }), fb.patchMaterial(other.id, { orden: m.orden })]);
    }
    await loadAll(); renderAll();
  } catch (err) { console.error(err); toast("No se pudo completar la acción.", true); }
});

function startEdit(m) {
  showTab("cargar");
  editingId = m.id; tipoTocado = true;
  linkInput.value = m.url || "";
  $("#f-titulo").value = m.titulo;
  setTipo(m.tipo);
  $("#f-guion").value = m.guionId || "";
  $("#f-inst").value = m.instrumento || "";
  $("#form-title").textContent = "Editar material";
  $("#btn-save").textContent = "Guardar cambios";
  $("#btn-cancel-edit").hidden = false;
  onLinkChange();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------- Guiones ----------
function renderGuiones() {
  const counts = new Map();
  materiales.forEach((m) => counts.set(m.guionId, (counts.get(m.guionId) || 0) + 1));
  $("#guion-list").innerHTML = guiones.length
    ? guiones.map((g, i) => `
      <div class="item" data-id="${esc(g.id)}">
        <div class="item-main"><b>${esc(g.nombre)}</b><span>${counts.get(g.id) || 0} material${(counts.get(g.id) || 0) === 1 ? "" : "es"}</span></div>
        <div class="item-actions">
          <button class="btn-icon" data-act="up" ${i === 0 ? "disabled" : ""} aria-label="Subir" type="button">${ICON.up}</button>
          <button class="btn-icon" data-act="down" ${i === guiones.length - 1 ? "disabled" : ""} aria-label="Bajar" type="button">${ICON.down}</button>
          <button class="btn-icon" data-act="rename" aria-label="Renombrar" type="button">${ICON.edit}</button>
          <button class="btn-icon" data-act="del" aria-label="Eliminar" type="button" style="color:var(--danger)">${ICON.trash}</button>
        </div>
      </div>`).join("")
    : `<div class="empty">Todavía no hay guiones. Creá el primero arriba.</div>`;
}
$("#guion-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = $("#g-nombre").value.trim();
  if (!nombre) return;
  if (guiones.some((g) => g.nombre.toLowerCase() === nombre.toLowerCase())) { toast("Ya existe un guion con ese nombre.", true); return; }
  try { await fb.saveGuion(null, { nombre }); $("#g-nombre").value = ""; await loadAll(); renderAll(); toast("Guion creado."); }
  catch (err) { console.error(err); toast("No se pudo crear el guion.", true); }
});
$("#guion-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const id = btn.closest(".item").dataset.id;
  const g = guiones.find((x) => x.id === id);
  const i = guiones.indexOf(g);
  try {
    if (btn.dataset.act === "rename") {
      const nombre = prompt("Nuevo nombre del guion:", g.nombre)?.trim();
      if (!nombre || nombre === g.nombre) return;
      await fb.saveGuion(id, { nombre });
    } else if (btn.dataset.act === "del") {
      const n = await fb.countMaterialesDeGuion(id);
      if (n > 0) { toast(`No se puede eliminar: tiene ${n} material${n === 1 ? "" : "es"}. Movelos a otro guion primero.`, true); return; }
      if (!confirm(`¿Eliminar el guion “${g.nombre}”?`)) return;
      await fb.deleteGuion(id);
    } else {
      const other = guiones[btn.dataset.act === "up" ? i - 1 : i + 1];
      if (!other) return;
      await Promise.all([fb.patchGuion(g.id, { orden: other.orden }), fb.patchGuion(other.id, { orden: g.orden })]);
    }
    await loadAll(); renderAll();
  } catch (err) { console.error(err); toast("No se pudo completar la acción.", true); }
});

// ---------- Importar el contenido de la sala anterior ----------
let seed = null;
try { seed = (await import("./seed.js")).SEED; } catch { /* sin archivo de importación */ }
function renderImport() {
  const show = !!seed && materiales.length === 0;
  $("#import-panel").hidden = !show;
  if (show) $("#import-text").textContent = `La sala anterior tenía ${seed.materiales.length} materiales (videos, timbal y audios) organizados en ${seed.guiones.length} guiones. Importalos de una vez y después seguís cargando desde acá. Hacelo una sola vez.`;
}
$("#btn-import").addEventListener("click", async () => {
  const btn = $("#btn-import");
  btn.disabled = true; btn.textContent = "Importando…";
  $("#import-error").textContent = "";
  try {
    await fb.importSeed(seed, user.uid);
    toast(`Listo: ${seed.materiales.length} materiales importados.`);
    await loadAll(); renderAll();
  } catch (err) {
    console.error(err);
    $("#import-error").textContent = err?.code === "permission-denied"
      ? "Firestore rechazó la importación. Revisá que hayas agregado las reglas de guiones/materiales y que tu usuario tenga admin: true."
      : "No se pudo importar. Intentá de nuevo.";
    btn.disabled = false; btn.textContent = "Importar ahora";
  }
});

// ---------- Inicio ----------
try { await loadAll(); } catch (err) { console.error(err); toast("No se pudieron cargar los datos. Revisá las reglas de Firestore.", true); }
renderAll();
resetForm({ keepMeta: false });
if (!guiones.length && !seed) toast("Empezá creando un guion: elegí “Crear guion nuevo…” en el formulario.");
hideLoading();
