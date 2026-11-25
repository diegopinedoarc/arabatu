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

## Sala renovada (noviembre 2026)

La sala de estudio (`sala-estudio.html`) se rediseñó con las mismas mejoras que Vibra, manteniendo la marca de Arabatu:

- **Celular:** menú de cuenta con la inicial (el logo sigue llevando al inicio), buscador a todo el ancho y botón *Filtros* con panel inferior; los filtros aplicados se ven como chips con ×.
- **Videos:** tarjetas 16:9, lista de una columna en celular, búsqueda por palabras sueltas ("timbal epab").
- **Por guion / Todos los videos:** cada guion es un álbum con su página, el botón *Escuchar audio del guion* y *Siguiente en el guion*.
- **Vista de video** (reemplaza al modal): botón Atrás que conserva filtros y scroll, barra propia de YouTube (−10 s, +10 s, velocidad, pantalla completa), audio del guion y otros videos del guion.
- **Orden de práctica:** en `sala-admin.html` → Material, elegí un guion en el filtro y acomodá con las flechas.

No cambiaron las reglas de Firestore ni los datos: los guiones existentes se usan directamente como álbumes.

## Favoritos y guiones con audios

- **Favoritos:** cada miembro marca con la estrella audios y videos (tarjetas, filas de audio y página del video) y los ve juntos en la sección *Favoritos* del menú. Se guardan en `users/{uid}/favoritos/{materialId}`. **Hay que publicar las reglas nuevas** (`sala/firestore.rules`, bloque "Favoritos de la sala"); mientras no estén, las estrellas quedan ocultas y el resto de la sala funciona igual.
- **Audios y videos del mismo guion:** en *Por guion* aparecen todos los guiones con material (también los que solo tienen audios, como Xango o Rocky). La página del guion muestra sus audios arriba y sus videos abajo, y el nombre del guion en cualquier tarjeta (también en Audios) lleva a esa página.
