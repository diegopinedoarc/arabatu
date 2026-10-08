// Guardia de sesión: deja pasar solo a usuarios aprobados (igual que antes) y,
// para el panel de administración, a quienes tengan `admin: true` en su documento de usuario.
import * as fb from "./firebase.js";

export const isAdmin = (profile) => profile?.admin === true || profile?.rol === "admin";

export function requireSession({ admin = false } = {}) {
  return new Promise((resolve) => {
    let resolved = false;
    fb.onUser(async (user) => {
      if (!user) return location.replace("./login.html");
      try {
        const profile = await fb.getProfile(user.uid);
        if (!profile || !profile.approved) { await fb.logout(); return location.replace("./login.html"); }
        if (admin && !isAdmin(profile)) return location.replace("./sala-estudio.html");
        if (!resolved) { resolved = true; resolve({ user, profile }); }
      } catch (err) {
        console.error(err);
        location.replace("./login.html");
      }
    });
  });
}

export async function logoutAndLeave() {
  sessionStorage.removeItem("arabatu_uid");
  sessionStorage.removeItem("arabatu_name");
  await fb.logout();
  location.replace("./login.html");
}
