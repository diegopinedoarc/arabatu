// Reproductor fijo de audios.
// - YouTube: controles propios (play, progreso, volumen) con la IFrame API. El video queda visible en el panel,
//   como exigen las condiciones de uso de YouTube.
// - Drive: se muestra el reproductor de Google dentro del panel (no permite controlarlo desde afuera).
import { embedUrl } from "./link-parser.js";
import { $, ICON, fmtTime } from "./ui.js";

const fillRange = (el) => {
  const max = Number(el.max) || 0;
  el.style.setProperty("--pct", max ? `${(Number(el.value) / max) * 100}%` : "0%");
};

export function createPlayer({ onChange, onError } = {}) {
  const bar = $("#player");
  const els = {
    title: $("#pl-title"), sub: $("#pl-sub"), cover: $("#pl-cover"),
    prev: $("#pl-prev"), play: $("#pl-play"), next: $("#pl-next"),
    seek: $("#pl-seek"), cur: $("#pl-cur"), dur: $("#pl-dur"), vol: $("#pl-vol"),
    host: $("#yt-host"), drive: $("#drive-frame"), label: $("#stage-label"), close: $("#stage-close"),
  };
  let yt = null, apiPromise = null, timer = null, dragging = false, token = 0;
  let current = null, queue = [], playing = false, mode = null;

  const loadApi = () => {
    if (window.YT?.Player) return Promise.resolve();
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const prevCb = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prevCb?.(); resolve(); };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = () => { apiPromise = null; reject(new Error("No se pudo cargar YouTube")); };
      document.head.appendChild(s);
    });
    return apiPromise;
  };

  function setPlaying(v) {
    playing = v;
    els.play.innerHTML = v ? ICON.pause : ICON.play;
    els.play.setAttribute("aria-label", v ? "Pausar" : "Reproducir");
  }

  function stopTimer() { clearInterval(timer); timer = null; }
  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      if (!yt?.getCurrentTime || dragging) return;
      const cur = yt.getCurrentTime() || 0, dur = yt.getDuration() || 0;
      els.seek.max = dur; els.seek.value = cur; fillRange(els.seek);
      els.cur.textContent = fmtTime(cur); els.dur.textContent = fmtTime(dur);
    }, 400);
  }

  function destroyYT() {
    stopTimer();
    try { yt?.destroy(); } catch { /* ya no existe */ }
    yt = null;
    els.host.innerHTML = "";
  }

  function resetProgress() {
    els.seek.max = 0; els.seek.value = 0; fillRange(els.seek);
    els.cur.textContent = "0:00"; els.dur.textContent = "0:00";
  }

  function setControlsEnabled(on) {
    els.play.disabled = !on; els.seek.disabled = !on; els.vol.disabled = !on;
  }

  function showInfo(item, list) {
    els.title.textContent = item.titulo;
    const guion = item._guion ? `${item._guion}` : "";
    const inst = item.instrumento ? item.instrumento : "";
    els.sub.textContent = [guion, inst].filter(Boolean).join(" · ") || (item.servicio === "drive" ? "Google Drive" : "YouTube");
    els.cover.src = item._thumb || "./assets/images/logo.png";
    els.cover.classList.toggle("is-logo", !item._thumb);
    const i = list.findIndex((x) => x.id === item.id);
    els.prev.disabled = i <= 0;
    els.next.disabled = i < 0 || i >= list.length - 1;
  }

  async function play(item, list = [item]) {
    const my = ++token;
    current = item; queue = list;
    document.body.classList.add("has-player");
    showInfo(item, list);
    resetProgress();
    setPlaying(false);
    onChange?.(item);

    if (item.servicio === "drive") {
      mode = "drive";
      bar.classList.add("drive-mode");
      destroyYT();
      els.host.hidden = true;
      els.drive.hidden = false;
      els.drive.src = embedUrl("drive", item.externalId);
      els.label.textContent = "Google Drive";
      setControlsEnabled(false);
      els.sub.textContent = "Usá el reproductor del panel para pausar o avanzar";
      return;
    }

    mode = "youtube";
    bar.classList.remove("drive-mode");
    els.drive.hidden = true; els.drive.src = "about:blank";
    els.host.hidden = false;
    els.label.textContent = "YouTube";
    setControlsEnabled(true);
    try { await loadApi(); } catch (e) { onError?.("No se pudo cargar el reproductor de YouTube. Revisá tu conexión."); return; }
    if (my !== token) return; // se eligió otro tema mientras cargaba

    if (yt?.loadVideoById) { yt.loadVideoById(item.externalId); return; }
    els.host.innerHTML = '<div id="yt-target"></div>';
    yt = new window.YT.Player("yt-target", {
      videoId: item.externalId,
      playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1 },
      events: {
        onReady: (e) => { e.target.setVolume(Number(els.vol.value)); e.target.playVideo(); },
        onStateChange: (e) => {
          const S = window.YT.PlayerState;
          if (e.data === S.PLAYING) { setPlaying(true); startTimer(); }
          else if (e.data === S.PAUSED) setPlaying(false);
          else if (e.data === S.ENDED) { setPlaying(false); next(true); }
        },
        onError: () => { setPlaying(false); onError?.("No se pudo reproducir este video (puede ser privado, borrado o tener la reproducción externa desactivada)."); },
      },
    });
  }

  function toggle() {
    if (!yt || mode !== "youtube") return;
    playing ? yt.pauseVideo() : yt.playVideo();
  }

  function step(delta, auto = false) {
    if (!current) return;
    const i = queue.findIndex((x) => x.id === current.id);
    const target = queue[i + delta];
    if (target) play(target, queue);
    else if (auto) setPlaying(false);
  }
  const next = (auto = false) => step(1, auto);
  const prev = () => {
    if (mode === "youtube" && yt?.getCurrentTime && yt.getCurrentTime() > 3) { yt.seekTo(0, true); return; }
    step(-1);
  };

  function stop() {
    token++;
    destroyYT();
    els.drive.src = "about:blank"; els.drive.hidden = true; els.host.hidden = false;
    document.body.classList.remove("has-player");
    bar.classList.remove("drive-mode");
    current = null; mode = null; setPlaying(false);
    onChange?.(null);
  }

  // Eventos de la interfaz
  els.play.addEventListener("click", toggle);
  els.next.addEventListener("click", () => next());
  els.prev.addEventListener("click", prev);
  els.close.addEventListener("click", stop);
  els.seek.addEventListener("input", () => { dragging = true; els.cur.textContent = fmtTime(els.seek.value); fillRange(els.seek); });
  els.seek.addEventListener("change", () => { yt?.seekTo?.(Number(els.seek.value), true); dragging = false; });
  els.vol.addEventListener("input", () => { fillRange(els.vol); yt?.setVolume?.(Number(els.vol.value)); });
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && current && document.activeElement === document.body) { e.preventDefault(); toggle(); }
  });

  els.cover.addEventListener("error", () => { if (!els.cover.src.endsWith("logo.png")) { els.cover.src = "./assets/images/logo.png"; els.cover.classList.add("is-logo"); } });
  els.prev.innerHTML = ICON.prev; els.next.innerHTML = ICON.next; els.play.innerHTML = ICON.play;
  els.vol.value = 80; fillRange(els.vol);

  return { play, stop, toggle, next, prev, get current() { return current; } };
}
