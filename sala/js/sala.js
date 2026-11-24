import * as fb from "./firebase.js";
import { requireSession, logoutAndLeave, isAdmin } from "./session.js";
import { createPlayer, loadYouTubeApi } from "./player.js";
import { embedUrl, thumbUrl, watchUrl } from "./link-parser.js";
import { $, $$, esc, toast, hideLoading, hydrateIcons, coverHTML, ICON, fmtTime } from "./ui.js";

hydrateIcons();
const { user, profile } = await requireSession();
// El Prode y el resto de la web leen estas claves
sessionStorage.setItem("arabatu_uid", user.uid);
sessionStorage.setItem("arabatu_name", profile.name || user.email);

// ---------- Cabecera de usuario ----------
const firstName = (profile.name || "").split(" ")[0] || "miembro";
const initial = firstName.charAt(0).toUpperCase();
$("#user-chip").innerHTML = `<span class="avatar" aria-hidden="true">${esc(initial)}</span><b>${esc(firstName)}</b>`;
$("#acct-btn").textContent = initial;
$("#acct-name").textContent = firstName;
if (isAdmin(profile)) $$(".admin-only").forEach((el) => (el.hidden = false));
if (profile.rol === "tesorero") $$(".caja-only").forEach((el) => (el.hidden = false));
$$("[data-logout]").forEach((b) => b.addEventListener("click", logoutAndLeave));

// ---------- Datos ----------
// En Arabatu cada guion es un álbum: sus videos y audios se estudian en el orden en que el admin los acomodó
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
// Videos o audios de un guion, en orden de práctica (el mismo orden que se ve en la administración: arriba = primero)
const albumMats = (id, tipo) => materiales.filter((m) => m.guionId === id && (!tipo || m.tipo === tipo));
const albumsWithVideos = () => guiones.filter((g) => albumMats(g.id, "video").length > 0);

// ---------- Estado y filtros ----------
const state = { tipo: location.hash === "#videos" ? "video" : "audio", vista: "guion", guion: "all", instrumento: "all", q: "" };
let visible = [];

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Por guion: una portada por guion, con su nombre y la cantidad de videos
function renderAlbumGrid(words) {
  const all = albumsWithVideos();
  const list = all.filter((a) => {
    if (!words.length) return true;
    const hay = norm(`${a.nombre} ` + albumMats(a.id, "video").map((m) => `${m.titulo} ${m.instrumento || ""} ${m._guion}`).join(" "));
    return words.every((w) => hay.includes(w));
  });
  const noun = (n) => (n === 1 ? "guion" : "guiones");
  $("#hero-sub").textContent = words.length ? `${list.length} de ${all.length} ${noun(all.length)}` : `${all.length} ${noun(all.length)}`;
  $("#albums").innerHTML = list
    .map((a) => {
      const vids = albumMats(a.id, "video");
      return `
      <a class="acard" href="#guion/${encodeURIComponent(a.id)}" data-aid="${esc(a.id)}">
        ${coverHTML(vids[0], vids[0]._thumb)}
        <div class="card-body">
          <div class="card-title">${esc(a.nombre)}</div>
          <div class="card-meta">${vids.length} ${vids.length === 1 ? "video" : "videos"}</div>
        </div>
      </a>`;
    })
    .join("");
  const empty = $("#empty");
  empty.hidden = list.length > 0;
  if (!list.length) empty.innerHTML = `<div class="big">🔍</div>No hay guiones con esa búsqueda.`;
}

function render() {
  const items = materiales.filter((m) => m.tipo === state.tipo);
  const label = state.tipo === "audio" ? "audios" : "videos";

  // Videos: "Por guion" (álbumes) o "Todos los videos" (grilla con filtros). Sin guiones cargados, solo la grilla.
  const hayGuiones = albumsWithVideos().length > 0;
  const porGuion = state.tipo === "video" && hayGuiones && state.vista === "guion";
  $("#vista-seg").hidden = !(state.tipo === "video" && hayGuiones);
  $$("#vista-seg [data-vista]").forEach((b) => {
    b.classList.toggle("active", b.dataset.vista === state.vista);
    b.setAttribute("aria-selected", String(b.dataset.vista === state.vista));
  });
  listView.classList.toggle("vista-guion", porGuion);
  $("#q").placeholder = porGuion ? "Buscar guiones o videos" : "Buscar por título, guion o instrumento";

  $("#hero-title").textContent = state.tipo === "audio" ? "Audios" : "Videos";
  $$("[data-tipo]").forEach((b) => b.classList.toggle("active", b.dataset.tipo === state.tipo));
  document.title = `${state.tipo === "audio" ? "Audios" : "Videos"} · Arabatu Bloco`;
  const grid = $("#grid");
  grid.classList.toggle("is-video", state.tipo === "video");
  grid.classList.toggle("is-audio", state.tipo === "audio");

  // Guiones (solo los que tienen material de este tipo)
  const counts = new Map();
  items.forEach((m) => counts.set(m.guionId || "", (counts.get(m.guionId || "") || 0) + 1));
  const guionesOpc = [];
  guiones.forEach((g) => counts.has(g.id) && guionesOpc.push({ id: g.id, nombre: g.nombre, n: counts.get(g.id) }));
  const orphans = [...counts.entries()].filter(([id]) => !guionName.has(id)).reduce((a, [, n]) => a + n, 0);
  if (orphans) guionesOpc.push({ id: "", nombre: "Sin guion", n: orphans });
  if (state.guion !== "all" && !guionesOpc.some((c) => c.id === state.guion)) state.guion = "all";
  const gsel = $("#guion-select");
  gsel.innerHTML = `<option value="all">Todos los guiones</option>` +
    guionesOpc.map((r) => `<option value="${esc(r.id)}">${esc(r.nombre)} (${r.n})</option>`).join("");
  gsel.value = state.guion;
  gsel.closest(".field").hidden = guionesOpc.length === 0;

  // Instrumentos presentes
  const insts = [...new Set(items.map((m) => (m.instrumento || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  if (state.instrumento !== "all" && !insts.includes(state.instrumento)) state.instrumento = "all";
  const sel = $("#inst-select");
  sel.innerHTML = `<option value="all">Todos los instrumentos</option>` + insts.map((i) => `<option value="${esc(i)}">${esc(i)}</option>`).join("");
  sel.value = state.instrumento;
  sel.closest(".field").hidden = insts.length === 0;

  // Filtrado: cada palabra de la búsqueda puede coincidir con título, guion o instrumento
  const words = norm(state.q.trim()).split(/\s+/).filter(Boolean);
  if (porGuion) { $("#grid").hidden = true; $("#albums").hidden = false; renderAlbumGrid(words); return; }
  $("#albums").hidden = true; $("#grid").hidden = false;
  visible = items.filter((m) => {
    const okG = state.guion === "all" || (m.guionId || "") === state.guion || (state.guion === "" && !guionName.has(m.guionId));
    const okI = state.instrumento === "all" || (m.instrumento || "").trim() === state.instrumento;
    const hay = norm(`${m.titulo} ${m._guion} ${m.instrumento}`);
    const okQ = words.every((w) => hay.includes(w));
    return okG && okI && okQ;
  });

  // Encabezado: el número se actualiza al filtrar
  const noun = (n) => (n === 1 ? label.slice(0, -1) : label);
  const filtering = state.guion !== "all" || state.instrumento !== "all" || words.length > 0;
  $("#hero-sub").textContent = filtering
    ? `${visible.length} de ${items.length} ${noun(items.length)}`
    : `${items.length} ${noun(items.length)}`;

  // Filtros aplicados (visibles debajo del buscador, con × para quitarlos)
  const applied = [];
  if (state.guion !== "all") applied.push({ key: "guion", text: state.guion === "" ? "Sin guion" : guionName.get(state.guion) || "Guion" });
  if (state.instrumento !== "all") applied.push({ key: "instrumento", text: state.instrumento });
  if (words.length) applied.push({ key: "q", text: `“${state.q.trim()}”` });
  $("#active-filters").innerHTML = applied.length
    ? applied.map((f) => `<button class="fchip" type="button" data-clear="${f.key}" aria-label="Quitar filtro ${esc(f.text)}">${esc(f.text)}<span class="x">${ICON.close}</span></button>`).join("") +
      (applied.length > 1 ? `<button class="link-btn" type="button" data-clear="all">Limpiar todo</button>` : "")
    : "";
  const nSel = (state.guion !== "all") + (state.instrumento !== "all");
  const badge = $("#filters-badge");
  badge.hidden = !nSel; badge.textContent = nSel;
  $("#filters-apply").textContent = `Ver ${visible.length} ${visible.length === 1 ? "resultado" : "resultados"}`;

  // Tarjetas
  $("#grid").innerHTML = visible
    .map((m) => `
      <div class="card${player.current?.id === m.id ? " is-playing" : ""}" data-id="${esc(m.id)}" role="button" tabindex="0" aria-label="${esc((m.tipo === "video" ? "Ver " : "Reproducir ") + m.titulo)}">
        ${coverHTML(m, m._thumb).replace("</div>", `<span class="play-fab">${ICON.play}</span></div>`)}
        <div class="card-body">
          <div class="card-title">${esc(m.titulo)}</div>
          <div class="card-meta">
            ${m._guion ? `<span class="meta-guion">${esc(m._guion)}</span>` : ""}
            ${m.instrumento ? `<span class="tag-inst">${esc(m.instrumento)}</span>` : ""}
          </div>
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

// ---------- Reproductor de audio y vista de video ----------
const watch = $("#watch"), listView = $("#list-view"), albumView = $("#album-view");
let currentVideo = null, currentAlbum = null, relAudios = [], audioDrag = false;

// Tres vistas: lista (0) > página de guion (1) > video (2). Al volver "hacia atrás" se recupera la posición del scroll.
let currentView = "list";
const DEPTH = { list: 0, album: 1, watch: 2 };
const scrolls = { list: 0, album: 0 };
function setView(next) {
  const prev = currentView;
  if (prev === next) return;
  scrolls[prev] = window.scrollY;
  listView.hidden = next !== "list";
  albumView.hidden = next !== "album";
  watch.hidden = next !== "watch";
  currentView = next;
  window.scrollTo(0, DEPTH[next] < DEPTH[prev] ? scrolls[next] || 0 : 0);
}
const setPct = (el) => {
  const max = Number(el.max) || 0;
  el.style.setProperty("--pct", max ? `${(Number(el.value) / max) * 100}%` : "0%");
};

// Estado de las filas de "Audio del guion" (botón, progreso) según lo que suena en el reproductor
function updateAudioRows() {
  updateAlbumAudioBtn();
  const cur = player.current;
  $$(".arow").forEach((row) => {
    const on = cur?.id === row.dataset.id;
    row.classList.toggle("active", on);
    row.querySelector(".arow-play").innerHTML = on && player.playing ? ICON.pause : ICON.play;
    if (!on) {
      const s = row.querySelector("input");
      s.max = 0; s.value = 0; setPct(s);
      row.querySelector(".time").textContent = "0:00";
      row.querySelector(".time.r").textContent = "0:00";
    }
  });
}

// Al empezar un audio, el video se pausa (YouTube) o se descarga (Drive no se puede pausar desde afuera)
function pauseVideoForAudio() {
  if (!currentVideo) return;
  if (currentVideo.servicio === "youtube") vyt?.pauseVideo?.();
  else if (vb.frame.src && !vb.frame.src.startsWith("about:blank")) {
    vb.frame.src = "about:blank";
    $("#vm-resume").hidden = false;
  }
}

const player = createPlayer({
  onChange: (cur) => {
    $$(".card").forEach((c) => c.classList.toggle("is-playing", c.dataset.id === cur?.id));
    updateAudioRows();
  },
  onPlayState: (playing) => { updateAudioRows(); if (playing) pauseVideoForAudio(); },
  onProgress: (c, d) => {
    const row = $(".arow.active");
    if (!row || audioDrag) return;
    const s = row.querySelector("input");
    s.max = d; s.value = c; setPct(s);
    row.querySelector(".time").textContent = fmtTime(c);
    row.querySelector(".time.r").textContent = fmtTime(d);
  },
  onError: (msg) => toast(msg, true),
});

// Barra propia para videos de YouTube (debajo de la imagen, no encima)
const vb = { bar: $("#vm-bar"), host: $("#vm-yt"), frame: $("#vm-frame"), play: $("#vb-play"), seek: $("#vb-seek"),
  cur: $("#vb-cur"), dur: $("#vb-dur"), speed: $("#vb-speed"), stage: $("#vm-stage") };
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];
let vyt = null, vtimer = null, vdrag = false, vtoken = 0, vplaying = false;
const fillSeek = () => {
  const max = Number(vb.seek.max) || 0;
  vb.seek.style.setProperty("--pct", max ? `${(Number(vb.seek.value) / max) * 100}%` : "0%");
};
function vSetPlaying(v) {
  vplaying = v;
  vb.play.innerHTML = v ? ICON.pause : ICON.play;
  vb.play.setAttribute("aria-label", v ? "Pausar" : "Reproducir");
}
function vStopYT() {
  clearInterval(vtimer); vtimer = null;
  try { vyt?.destroy(); } catch { /* ya no existe */ }
  vyt = null; vb.host.innerHTML = "";
  vSetPlaying(false);
  vb.seek.max = 0; vb.seek.value = 0; fillSeek(); vb.cur.textContent = "0:00"; vb.dur.textContent = "0:00";
  vb.speed.textContent = "1x";
}
async function startYouTubeVideo(m) {
  const my = ++vtoken;
  try { await loadYouTubeApi(); } catch { toast("No se pudo cargar el reproductor de YouTube. Revisá tu conexión.", true); return; }
  if (my !== vtoken) return;
  vb.host.innerHTML = '<div id="vm-yt-target"></div>';
  vyt = new window.YT.Player("vm-yt-target", {
    videoId: m.externalId,
    playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1, fs: 0 },
    events: {
      onReady: (e) => { e.target.playVideo(); },
      onStateChange: (e) => {
        const S = window.YT.PlayerState;
        if (e.data === S.PLAYING) {
          vSetPlaying(true);
          if (player.playing) player.pause(); // no suenan el audio y el video a la vez
          if (!vtimer) vtimer = setInterval(() => {
            if (!vyt?.getCurrentTime || vdrag) return;
            const c = vyt.getCurrentTime() || 0, d = vyt.getDuration() || 0;
            vb.seek.max = d; vb.seek.value = c; fillSeek();
            vb.cur.textContent = fmtTime(c); vb.dur.textContent = fmtTime(d);
          }, 300);
        } else if (e.data === S.PAUSED || e.data === S.ENDED) vSetPlaying(false);
      },
      onError: () => toast("No se pudo reproducir este video (puede ser privado, borrado o tener la reproducción externa desactivada).", true),
    },
  });
}
vb.play.addEventListener("click", () => { if (vyt) vplaying ? vyt.pauseVideo() : vyt.playVideo(); });
$("#vb-back").addEventListener("click", () => vyt?.seekTo?.(Math.max(0, vyt.getCurrentTime() - 10), true));
$("#vb-fwd").addEventListener("click", () => vyt?.seekTo?.(vyt.getCurrentTime() + 10, true));
vb.speed.addEventListener("click", () => {
  if (!vyt) return;
  const i = SPEEDS.indexOf(vyt.getPlaybackRate());
  const r = SPEEDS[(i + 1) % SPEEDS.length];
  vyt.setPlaybackRate(r);
  vb.speed.textContent = `${r}x`;
});
vb.seek.addEventListener("input", () => { vdrag = true; vb.cur.textContent = fmtTime(vb.seek.value); fillSeek(); });
vb.seek.addEventListener("change", () => { vyt?.seekTo?.(Number(vb.seek.value), true); vdrag = false; });
$("#vb-full").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else (vb.stage.requestFullscreen || vb.stage.webkitRequestFullscreen)?.call(vb.stage);
});
vb.play.innerHTML = ICON.play;

function stopVideoPlayback() {
  vtoken++;
  if (document.fullscreenElement) document.exitFullscreen?.();
  vStopYT();
  vb.frame.src = "about:blank";
}

// Relacionados: los demás videos del mismo guion (en orden de práctica) y sus audios
function renderRelated(m) {
  const albumVids = m.guionId ? albumMats(m.guionId, "video") : [];
  relAudios = m.guionId ? albumMats(m.guionId, "audio") : [];
  const vids = albumVids.filter((v) => v.id !== m.id);

  $("#audio-card").hidden = !relAudios.length;
  $("#audio-title").textContent = `${relAudios.length > 1 ? "Audios" : "Audio"} del guion`;
  $("#related-title").textContent = "Otros videos de este guion";
  const idx = albumVids.findIndex((v) => v.id === m.id);
  const nxt = idx >= 0 ? albumVids[idx + 1] : null;
  const nextEl = $("#watch-next");
  nextEl.hidden = !nxt;
  if (nxt) {
    nextEl.dataset.vid = nxt.id;
    nextEl.href = `#video/${encodeURIComponent(nxt.id)}`;
    $("#watch-next-title").textContent = nxt.titulo;
  }
  $("#audio-list").innerHTML = relAudios
    .map((a) => `
      <div class="arow${a.servicio === "drive" ? " is-drive" : ""}" data-id="${esc(a.id)}">
        <button class="arow-play" type="button" aria-label="Escuchar ${esc(a.titulo)}">${ICON.play}</button>
        <div class="arow-main">
          <div class="arow-title">${esc(a.titulo)}</div>
          ${a.instrumento ? `<div class="arow-meta">${esc(a.instrumento)}</div>` : ""}
          <div class="arow-prog"><span class="time">0:00</span><input type="range" min="0" max="0" step="0.1" value="0" aria-label="Progreso de ${esc(a.titulo)}" /><span class="time r">0:00</span></div>
          <div class="arow-note">Los controles están en el panel de abajo.</div>
        </div>
      </div>`)
    .join("");
  updateAudioRows();

  $("#related").hidden = !vids.length;
  $("#watch-grid").classList.toggle("has-side", vids.length > 0);
  $("#related-list").innerHTML = vids
    .map((v) => `
      <a class="rel" href="#video/${encodeURIComponent(v.id)}" data-vid="${esc(v.id)}">
        ${coverHTML(v, v._thumb)}
        <div class="rel-body">
          <div class="rel-title">${esc(v.titulo)}</div>
          <div class="card-meta">${esc([v._guion, v.instrumento].filter(Boolean).join(" · "))}</div>
        </div>
      </a>`)
    .join("");
}

function showWatch(m) {
  if (currentView === "watch" && currentVideo?.id === m.id) return;
  state.tipo = "video";
  $$("[data-tipo]").forEach((btn) => btn.classList.toggle("active", btn.dataset.tipo === "video"));
  stopVideoPlayback();
  currentVideo = m; currentAlbum = null;
  document.title = `${m.titulo} · Arabatu Bloco`;
  $("#vm-title").textContent = m.titulo;
  $("#vm-sub").textContent = [m._guion, m.instrumento].filter(Boolean).join(" · ");
  watch.dataset.service = m.servicio;
  $("#vm-resume").hidden = true;
  const yt = m.servicio === "youtube";
  vb.bar.hidden = !yt; vb.host.hidden = !yt; vb.frame.hidden = yt;
  if (yt) { vb.frame.src = "about:blank"; startYouTubeVideo(m); }
  else vb.frame.src = embedUrl(m.servicio, m.externalId, { autoplay: true });
  const open = $("#vm-open");
  open.href = watchUrl(m.servicio, m.externalId);
  open.textContent = yt ? "Abrir en YouTube ↗" : "Abrir en Drive ↗";
  // Volver: a la lista o, si venís de la página de un guion, a ese guion
  const from = history.state?.from;
  const fromName = from ? guionName.get(from) : "";
  $("#watch-back-label").textContent = fromName ? `Volver a ${fromName}` : "Volver a Videos";
  $("#watch-back").setAttribute("href", fromName ? `#guion/${encodeURIComponent(from)}` : "#videos");
  renderRelated(m);
  const was = currentView;
  setView("watch");
  if (was === "watch") window.scrollTo(0, 0);   // de un video a otro: arriba
}

// Página de un guion: sus videos en orden de práctica
function updateAlbumAudioBtn() {
  const btn = $("#album-audio");
  if (!btn || !currentAlbum) return;
  const on = albumMats(currentAlbum.id, "audio").some((x) => x.id === player.current?.id) && player.playing;
  btn.querySelector(".lbl").textContent = on ? "Pausar audio del guion" : "Escuchar audio del guion";
  btn.querySelector(".ico").innerHTML = on ? ICON.pause : ICON.headphones;
}
function showAlbum(a) {
  state.tipo = "video";
  $$("[data-tipo]").forEach((btn) => btn.classList.toggle("active", btn.dataset.tipo === "video"));
  if (currentView === "watch") { stopVideoPlayback(); currentVideo = null; }
  currentAlbum = a;
  const vids = albumMats(a.id, "video"), auds = albumMats(a.id, "audio");
  document.title = `${a.nombre} · Arabatu Bloco`;
  $("#album-title").textContent = a.nombre;
  $("#album-count").textContent = `${vids.length} ${vids.length === 1 ? "video" : "videos"}`;
  $("#album-cover").innerHTML = vids.length ? coverHTML(vids[0], vids[0]._thumb) : "";
  $("#album-audio").hidden = !auds.length;
  $("#album-list").innerHTML = vids
    .map((m) => `
      <div class="vrow" data-id="${esc(m.id)}" role="button" tabindex="0" aria-label="Ver ${esc(m.titulo)}">
        ${coverHTML(m, m._thumb)}
        <div>
          <div class="vrow-title">${esc(m.titulo)}</div>
          ${m.instrumento ? `<div class="vrow-meta">${esc(m.instrumento)}</div>` : ""}
        </div>
        <span class="vrow-play" aria-hidden="true">${ICON.play}</span>
      </div>`)
    .join("");
  updateAlbumAudioBtn();
  setView("album");
}

// Vuelve a la lista con la búsqueda, los filtros y la posición en que estaba
function showList() {
  if (currentView === "watch") stopVideoPlayback();
  currentVideo = null; currentAlbum = null;
  render();
  setView("list");
}

function route() {
  const h = location.hash;
  const am = h.match(/^#guion\/(.+)$/);
  const mm = h.match(/^#video\/(.+)$/);
  if (am) {
    const a = guiones.find((x) => x.id === decodeURIComponent(am[1]));
    if (a && albumMats(a.id, "video").length) return showAlbum(a);
    history.replaceState(null, "", "#videos");
    state.tipo = "video";
  } else if (mm) {
    const id = decodeURIComponent(mm[1]);
    const m = materiales.find((x) => x.id === id && x.tipo === "video");
    if (m) return showWatch(m);
    history.replaceState(null, "", "#videos");
    state.tipo = "video";
  } else if (h === "#videos") state.tipo = "video";
  else if (h === "#audios") state.tipo = "audio";
  showList();
}

// Abrir un video: nueva entrada de historial (Atrás vuelve a donde estabas). Entre videos relacionados: se reemplaza.
// `from` guarda el guion de origen para que "Volver" diga a dónde lleva.
function goVideo(id, replace = false, from = null) {
  const url = `#video/${encodeURIComponent(id)}`;
  if (replace) history.replaceState(history.state, "", url);
  else history.pushState(from ? { v: 1, from } : { v: 1 }, "", url);
  route();
}
function goAlbum(id) {
  history.pushState({ v: 1 }, "", `#guion/${encodeURIComponent(id)}`);
  route();
}
window.addEventListener("popstate", route);
function goBack(e) {
  e.preventDefault();
  if (history.state?.v) history.back();
  else { history.replaceState(null, "", "#videos"); route(); }
}
$("#watch-back").addEventListener("click", goBack);
$("#album-back").addEventListener("click", goBack);
$("#watch-next").addEventListener("click", (e) => { e.preventDefault(); goVideo(e.currentTarget.dataset.vid, true); });

// Guiones: abrir uno, abrir un video desde él, escuchar su audio
$("#albums").addEventListener("click", (e) => {
  const c = e.target.closest("[data-aid]");
  if (!c) return;
  e.preventDefault();
  goAlbum(c.dataset.aid);
});
$("#album-list").addEventListener("click", (e) => {
  const row = e.target.closest(".vrow");
  if (row && currentAlbum) goVideo(row.dataset.id, false, currentAlbum.id);
});
$("#album-list").addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("vrow")) { e.preventDefault(); e.target.click(); }
});
$("#album-audio").addEventListener("click", () => {
  if (!currentAlbum) return;
  const auds = albumMats(currentAlbum.id, "audio");
  if (!auds.length) return;
  if (auds.some((x) => x.id === player.current?.id)) return player.toggle();
  player.play(auds[0], auds);
});
$("#vista-seg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-vista]");
  if (!b || b.dataset.vista === state.vista) return;
  state.vista = b.dataset.vista;
  render();
});
$("#related-list").addEventListener("click", (e) => {
  const a = e.target.closest("[data-vid]");
  if (!a) return;
  e.preventDefault();
  goVideo(a.dataset.vid, true);
});
$("#vm-resume").addEventListener("click", () => {
  if (!currentVideo) return;
  vb.frame.src = embedUrl(currentVideo.servicio, currentVideo.externalId, { autoplay: true });
  $("#vm-resume").hidden = true;
});

// Filas de audio del guion
$("#audio-list").addEventListener("click", (e) => {
  const btn = e.target.closest(".arow-play");
  if (!btn) return;
  const id = btn.closest(".arow").dataset.id;
  if (player.current?.id === id) return player.toggle();
  const a = relAudios.find((x) => x.id === id);
  if (!a) return;
  pauseVideoForAudio();
  player.play(a, relAudios);
});
$("#audio-list").addEventListener("input", (e) => {
  if (e.target.type !== "range") return;
  audioDrag = true;
  const row = e.target.closest(".arow");
  row.querySelector(".time").textContent = fmtTime(e.target.value);
  setPct(e.target);
});
$("#audio-list").addEventListener("change", (e) => {
  if (e.target.type !== "range") return;
  player.seek(Number(e.target.value));
  audioDrag = false;
});

// ---------- Eventos ----------
$("#grid").addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  const m = visible.find((x) => x.id === card.dataset.id);
  if (!m) return;
  if (m.tipo === "video") return goVideo(m.id);
  if (player.current?.id === m.id) return player.toggle();
  player.play(m, visible.filter((x) => x.tipo === "audio"));
});

$("#grid").addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("card")) { e.preventDefault(); e.target.click(); }
});

$("#guion-select").addEventListener("change", (e) => { state.guion = e.target.value; render(); });
$("#inst-select").addEventListener("change", (e) => { state.instrumento = e.target.value; render(); });
let qTimer;
$("#q").addEventListener("input", (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value; render(); }, 120); });

function clearFilters(key) {
  if (key === "guion" || key === "all") state.guion = "all";
  if (key === "instrumento" || key === "all") state.instrumento = "all";
  if (key === "q" || key === "all") { state.q = ""; $("#q").value = ""; }
  render();
}
$("#active-filters").addEventListener("click", (e) => {
  const b = e.target.closest("[data-clear]");
  if (b) clearFilters(b.dataset.clear);
});

// Panel de filtros (celular): sube desde abajo
const sheet = { el: $("#filters"), back: $("#filters-backdrop"), btn: $("#btn-filters") };
function setSheet(open) {
  sheet.el.classList.toggle("open", open);
  sheet.back.hidden = !open;
  sheet.btn.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("sheet-open", open);
}
sheet.btn.addEventListener("click", () => setSheet(!sheet.el.classList.contains("open")));
$("#filters-close").addEventListener("click", () => setSheet(false));
$("#filters-apply").addEventListener("click", () => setSheet(false));
$("#filters-reset").addEventListener("click", () => { state.guion = "all"; state.instrumento = "all"; render(); });
sheet.back.addEventListener("click", () => setSheet(false));

// Menú de cuenta (celular)
const acctBtn = $("#acct-btn"), acctMenu = $("#acct-menu");
function setAcct(open) { acctMenu.hidden = !open; acctBtn.setAttribute("aria-expanded", String(open)); }
acctBtn.addEventListener("click", (e) => { e.stopPropagation(); setAcct(acctMenu.hidden); });
document.addEventListener("click", (e) => { if (!acctMenu.hidden && !acctMenu.contains(e.target)) setAcct(false); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  setAcct(false);
  if (sheet.el.classList.contains("open")) setSheet(false);
});

// Menú: Audios / Videos. Si estás en la vista de video, vuelve a la lista de esa sección.
$$("[data-tipo]").forEach((b) =>
  b.addEventListener("click", () => {
    const tipo = b.dataset.tipo;
    if (tipo !== state.tipo) { state.guion = "all"; state.instrumento = "all"; }
    state.tipo = tipo;
    setSheet(false);
    const hash = tipo === "video" ? "#videos" : "#audios";
    if (currentView !== "list") { history.pushState(null, "", hash); route(); window.scrollTo(0, 0); return; }
    history.replaceState(null, "", hash);
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }),
);

route();
hideLoading();
