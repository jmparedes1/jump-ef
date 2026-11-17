# JUMP EF — PWA experimental para iPhone

## Contenido
- `index.html`: interfaz.
- `style.css`: diseño adaptable.
- `app.js`: acceso a DeviceMotion, gráfica, detección experimental, historial CSV.
- `manifest.webmanifest`: instalación PWA.
- `sw.js`: caché sin conexión tras la primera carga.
- `icon-192.png`, `icon-512.png`: iconos.

## Publicar gratis desde un iPhone con GitHub Pages
1. En Safari entra en github.com, crea una cuenta o inicia sesión.
2. Crea un repositorio público nuevo llamado `jump-ef`.
3. Abre el repositorio, elige **Add file → Upload files** (si la interfaz móvil lo oculta, solicita «Sitio web de escritorio» en Safari).
4. Sube **los siete archivos** de la carpeta `jump-ef`, sin meterlos dentro de otra carpeta. Confirma con **Commit changes**.
5. En **Settings → Pages → Build and deployment**, selecciona **Deploy from a branch**, rama `main`, carpeta `/ (root)` y pulsa **Save**.
6. Cuando se publique, abre `https://TU_USUARIO.github.io/jump-ef/` en Safari.
7. En Safari: **Compartir → Añadir a pantalla de inicio → Abrir como app → Añadir**.
8. Abre JUMP EF desde el icono y pulsa **Activar sensores** para aceptar el permiso de movimiento.

Alternativa: usar Netlify Drop desde un navegador que permita subir la carpeta completa o el ZIP; comprueba que el sitio final usa HTTPS.

## Prueba básica
Con el teléfono quieto, la aceleración total menos gravedad debería oscilar cerca de 0 m/s². Mueve el teléfono suavemente y comprueba que la gráfica cambia. Después, con el teléfono bien fijado a la cintura, realiza saltos controlados sobre superficie segura. No saltes con el móvil en la mano. Comprueba el tiempo de vuelo con vídeo de cámara lenta y compara los resultados.

## Limitaciones importantes
- Este algoritmo experimental usa el módulo de la aceleración total, sin integración ni estimación de trayectoria, y detecta vuelo cuando la aceleración total cae por debajo del umbral durante al menos 35 ms, precedida de impulso. El aterrizaje se identifica por un pico de aceleración total.
- La detección puede dar falsos positivos y falsos negativos. La frecuencia de eventos depende de Safari y del dispositivo. No hay validación experimental ni precisión garantizada en centímetros.
- No es una medida equivalente a una plataforma de fuerzas, alfombra de contacto o vídeo validado. No utilizar para calificar alumnos.
- La fórmula h=g*t²/8 supone alturas iguales del centro de masas al despegar y aterrizar.
- Los datos se guardan en localStorage del dispositivo y pueden perderse si se borran datos del sitio. Exporta CSV periódicamente.
- No se ha probado en un iPhone físico desde este entorno. Es necesario verificar permisos y muestreo reales en Safari.
