// Lector de links de YouTube y Google Drive.
// parseLink(texto) → { ok:true, servicio, externalId, embedUrl, thumb, watchUrl } | { ok:false, error }

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const DRIVE_ID = /^[A-Za-z0-9_-]{20,}$/;

export function embedUrl(servicio, id, { autoplay = false } = {}) {
  if (servicio === "youtube") {
    const q = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1" });
    if (autoplay) q.set("autoplay", "1");
    return `https://www.youtube.com/embed/${id}?${q}`;
  }
  return `https://drive.google.com/file/d/${id}/preview`;
}

export function thumbUrl(servicio, id) {
  // Drive no ofrece miniaturas públicas confiables: la tarjeta usa una portada violeta.
  return servicio === "youtube" ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
}

export function watchUrl(servicio, id) {
  return servicio === "youtube"
    ? `https://www.youtube.com/watch?v=${id}`
    : `https://drive.google.com/file/d/${id}/view`;
}

function yt(id) {
  if (!YT_ID.test(id || "")) return { ok: false, error: "No pude encontrar el ID del video de YouTube en ese link." };
  return build("youtube", id);
}

function drive(id) {
  if (!DRIVE_ID.test(id || "")) return { ok: false, error: "No pude encontrar el ID del archivo de Drive en ese link." };
  return build("drive", id);
}

function build(servicio, id) {
  return {
    ok: true,
    servicio,
    externalId: id,
    embedUrl: embedUrl(servicio, id),
    thumb: thumbUrl(servicio, id),
    watchUrl: watchUrl(servicio, id),
  };
}

export function parseLink(raw) {
  const input = String(raw || "").trim();
  if (!input) return { ok: false, error: "Pegá un link de YouTube o de Drive." };

  let u;
  try {
    u = new URL(/^https?:\/\//i.test(input) ? input : "https://" + input);
  } catch {
    return { ok: false, error: "Eso no parece un link válido." };
  }

  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") return yt(parts[0]);

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") return yt(u.searchParams.get("v"));
    if (["shorts", "embed", "live", "v"].includes(parts[0])) return yt(parts[1]);
    if (parts[0] === "playlist") return { ok: false, error: "Ese link es una lista de reproducción. Pegá el link de un video puntual." };
    return { ok: false, error: "No reconozco ese link de YouTube. Probá con el link del video." };
  }

  if (host === "drive.google.com") {
    if (parts[0] === "drive" && parts[1] === "folders") return { ok: false, error: "Ese link es una carpeta. Pegá el link de un archivo puntual." };
    if (parts[0] === "file") {
      // /file/d/ID/view  o  /file/u/0/d/ID/view (cuentas múltiples)
      const i = parts.indexOf("d");
      return drive(i > -1 ? parts[i + 1] : null);
    }
    if (parts[0] === "open" || parts[0] === "uc") return drive(u.searchParams.get("id"));
    return { ok: false, error: "No reconozco ese link de Drive. Usá 'Compartir → Copiar link' sobre el archivo." };
  }

  if (host === "docs.google.com") {
    return { ok: false, error: "Ese es un documento de Google, no un audio o video de Drive." };
  }

  return { ok: false, error: "Por ahora solo se aceptan links de YouTube y Google Drive." };
}
