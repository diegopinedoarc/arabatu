# Sala de estudio · Arabatu (nuevo formato)

## 1. Reglas de Firestore

Firebase → proyecto `arabatuweb-1ee65` → Firestore → Reglas.
Pegá el contenido de `sala/firestore.rules` **reemplazando todo**: ya incluye tus reglas anteriores (Prode, Caja, usuarios) más las de la sala.

Cambio importante en `users`: antes cualquier usuario podía escribir su propio documento, incluso poniéndose `approved: true` o `rol: 'tesorero'`. Ahora solo puede crearlo al registrarse (pendiente y sin permisos); aprobar y dar roles se hace desde la consola de Firebase.

## 2. Darte permisos de administrador

En Firestore → colección `users` → tu documento: agregá el campo `admin` (boolean) = `true`.
No toques `rol`: si sos tesorero, tiene que seguir siendo `tesorero` para ver Control Caja.

## 3. Importar el contenido anterior

Abrí `/sala-admin.html` y tocá **Importar ahora** (una sola vez).
Pasa a Firestore los 9 videos, 30 videos de timbal y 8 audios de la sala anterior, ordenados por guion.

## 4. Limpieza (cuando verifiques que todo se ve bien)

- Borrá `_sala-estudio-anterior.html` (copia de respaldo de la sala vieja).
- Borrá `sala/js/seed.js` (ya no hace falta).

## Qué cambia

- Videos y Timbal ahora son una sola sección, **Videos**. El timbal quedó como guiones (Epab, Varios, Timbal Flur, Trio de Surdos) con instrumento "Timbal" o "Surdos".
- La sección "Recursos" (que decía "Próximamente") se quitó.
- El material se carga desde `/sala-admin.html` pegando links de YouTube o Drive.
- Los usuarios se siguen aprobando como siempre.
