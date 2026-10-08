import * as fb from "./firebase.js";
import { requireSession, logoutAndLeave, isAdmin } from "./session.js";
import { createPlayer } from "./player.js";
import { embedUrl, thumbUrl } from "./link-parser.js";
import { $, $$, esc, toast, hideLoading, hydrateIcons, coverHTML, ICON } from "./ui.js";

hydrateIcons();
const { user, profile } = await requireSession();
// El Prode y el resto de la web leen estas claves
sessionStorage.setItem("arabatu_uid", user.uid);
sessionStorage.setItem("arabatu_name", profile.name || user.email);

// ---------- Cabecera de usuario ----------
$("#user-chip").innerHTML = `Hola, <b>${esc((profile.name || "").split(" ")[0] || "miembro")}</b>`;
if (isAdmin(profile)) $$(".admin-only").forEach((el) => (el.hidden = false));
if (profile.rol === "tesorero") $$(".caja-only").forEach((el) => (el.hidden = false));
$$("[data-logout]").forEach((b) => b.addEventListener("click", logoutAndLeave));

// ---------- Datos ----------
let guiones = [], materiales = [];
try {
  [guiones, materiales] = await Promise.all([fb.listGuiones(), fb.listMateriales()]);
} catch (err) {
  console.error(err);
  toast("No se pudo cargar el material. Revisá tu conexión.", true);
}
const guionName = new Map(guiones.map((g) => [g.id, g.nombre]));
materiales = materiales.map((m) => ({
  ...m,
  _guion: guionName.get(m.guionId) || "",
  _thumb: thumbUrl(m.servicio, m.externalId),
}));

// ---------- Estado y filtros ----------
const state = { tipo: location.hash === "#videos" ? "video" : "audio", guion: "all", instrumento: "all", q: "" };
let visible = [];

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function render() {
  const items = materiales.filter((m) => m.tipo === state.tipo);
  const label = state.tipo === "audio" ? "audios" : "videos";

  $("#hero-title").textContent = state.tipo === "audio" ? "Audios" : "Videos";
  $("#hero-sub").textContent = `${items.length} ${items.length === 1 ? label.slice(0, -1) : label} para estudiar`;
  $$("[data-tipo]").forEach((b) => b.classList.toggle("active", b.dataset.tipo === state.tipo));
  document.title = `${state.tipo === "audio" ? "Audios" : "Videos"} · Vibra`;

  // Chips de guion (solo los que tienen material de este tipo)
  const counts = new Map();
  items.forEach((m) => counts.set(m.guionId || "", (counts.get(m.guionId || "") || 0) + 1));
  const chips = [{ id: "all", nombre: "Todos", n: items.length }];
  guiones.forEach((g) => counts.has(g.id) && chips.push({ id: g.id, nombre: g.nombre, n: counts.get(g.id) }));
  const orphans = [...counts.entries()].filter(([id]) => !guionName.has(id)).reduce((a, [, n]) => a + n, 0);
  if (orphans) chips.push({ id: "", nombre: "Sin guion", n: orphans });
  if (!chips.some((c) => c.id === state.guion)) state.guion = "all";
  $("#chips").innerHTML = chips
    .map((c) => `<button class="chip${c.id === state.guion ? " active" : ""}" data-guion="${esc(c.id)}" type="button">${esc(c.nombre)}<small>${c.n}</small></button>`)
    .join("");

  // Instrumentos presentes
  const insts = [...new Set(items.map((m) => (m.instrumento || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  if (state.instrumento !== "all" && !insts.includes(state.instrumento)) state.instrumento = "all";
  const sel = $("#inst-select");
  sel.innerHTML = `<option value="all">Todos los instrumentos</option>` + insts.map((i) => `<option value="${esc(i)}">${esc(i)}</option>`).join("");
  sel.value = state.instrumento;
  sel.hidden = insts.length === 0;

  // Filtrado
  const q = norm(state.q.trim());
  visible = items.filter((m) => {
    const okG = state.guion === "all" || (m.guionId || "") === state.guion || (state.guion === "" && !guionName.has(m.guionId));
    const okI = state.instrumento === "all" || (m.instrumento || "").trim() === state.instrumento;
    const okQ = !q || norm(`${m.titulo} ${m._guion} ${m.instrumento}`).includes(q);
    return okG && okI && okQ;
  });

  const filtering = state.guion !== "all" || state.instrumento !== "all" || q;
  $("#btn-clear").hidden = !filtering;
  $("#results-line").innerHTML = filtering ? `<b>${visible.length}</b> ${visible.length === 1 ? "resultado" : "resultados"}` : "";

  // Tarjetas
  $("#grid").innerHTML = visible
    .map((m) => `
      <div class="card${player.current?.id === m.id ? " is-playing" : ""}" data-id="${esc(m.id)}" role="button" tabindex="0" aria-label="${esc((m.tipo === "video" ? "Ver " : "Reproducir ") + m.titulo)}">
        ${coverHTML(m, m._thumb).replace("</div>", `<span class="play-fab">${ICON.play}</span></div>`)}
        <div class="card-title">${esc(m.titulo)}</div>
        <div class="card-meta">
          ${m._guion ? `<span>${esc(m._guion)}</span>` : ""}
          ${m.instrumento ? `<span class="tag tag-coral">${esc(m.instrumento)}</span>` : ""}
        </div>
      </div>`)
    .join("");

  const empty = $("#empty");
  empty.hidden = visible.length > 0;
  if (!visible.length) {
    empty.innerHTML = items.length
      ? `<div class="big">🔍</div>No hay resultados con esos filtros.`
      : `<div class="big">${state.tipo === "audio" ? "🎧" : "🎬"}</div>Todavía no hay ${label} cargados.${isAdmin(profile) ? ' <a class="link-btn" href="./sala-admin.html">Cargá el primero</a>' : ""}`;
  }
}

// ---------- Reproductor y modal ----------
const player = createPlayer({
  onChange: (cur) => $$(".card").forEach((c) => c.classList.toggle("is-playing", c.dataset.id === cur?.id)),
  onError: (msg) => toast(msg, true),
});

const modal = $("#video-modal");
function openVideo(m) {
  player.stop();
  $("#vm-title").textContent = m.titulo;
  $("#vm-sub").textContent = [m._guion, m.instrumento].filter(Boolean).join(" · ");
  $("#vm-frame").src = embedUrl(m.servicio, m.externalId, { autoplay: true });
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeVideo() {
  modal.classList.remove("open");
  $("#vm-frame").src = "about:blank";
  document.body.style.overflow = "";
}
$("#vm-close").addEventListener("click", closeVideo);
modal.addEventListener("click", (e) => { if (e.target === modal) closeVideo(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("open")) closeVideo(); });

// ---------- Eventos ----------
$("#grid").addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  const m = visible.find((x) => x.id === card.dataset.id);
  if (!m) return;
  if (m.tipo === "video") return openVideo(m);
  if (player.current?.id === m.id) return player.toggle();
  player.play(m, visible.filter((x) => x.tipo === "audio"));
});

$("#grid").addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("card")) { e.preventDefault(); e.target.click(); }
});

$("#chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  state.guion = chip.dataset.guion;
  render();
});
$("#inst-select").addEventListener("change", (e) => { state.instrumento = e.target.value; render(); });
let qTimer;
$("#q").addEventListener("input", (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value; render(); }, 120); });
$("#btn-clear").addEventListener("click", () => {
  Object.assign(state, { guion: "all", instrumento: "all", q: "" });
  $("#q").value = "";
  render();
});
$$("[data-tipo]").forEach((b) =>
  b.addEventListener("click", () => {
    state.tipo = b.dataset.tipo;
    state.guion = "all"; state.instrumento = "all";
    history.replaceState(null, "", state.tipo === "video" ? "#videos" : "#audios");
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }),
);

render();
hideLoading();
