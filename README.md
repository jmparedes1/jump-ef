# JUMP EF

Estimación experimental de la altura del salto vertical con el acelerómetro del iPhone. La app se sirve mediante HTTPS y puede añadirse a la pantalla de inicio. Los resultados se guardan en el dispositivo.

## Uso en Safari

1. Abre [JUMP EF](https://jmparedes1.github.io/jump-ef/) en Safari. Para instalarla, usa **Compartir → Añadir a pantalla de inicio → Añadir**.
2. Sujeta el iPhone firmemente a la cintura, activa el sensor y acepta el permiso de movimiento.
3. Elige el protocolo y una serie de 1, 3 o 5 saltos. Puedes registrar el grupo y el código del alumno.
4. Pulsa **Iniciar serie**, mantente quieto y salta al aviso. Entre intentos válidos hay cuatro segundos de pausa y una nueva cuenta atrás. Puedes detener la serie en cualquier momento.
5. Consulta el mejor salto y la media de la serie. El historial permite filtrar por protocolo, grupo y alumno, ver su evolución y exportar lo filtrado en CSV.

La demo ejecuta el detector con una señal simulada y deja el historial intacto. Tras una primera carga completa, la app puede abrirse sin conexión si el navegador conserva los archivos.

## Interpretar la medida

El gráfico muestra el módulo de la aceleración con gravedad. El detector estima el reposo durante la cuenta atrás, busca impulso, caída sostenida de la señal y recuperación con impacto. Estima el tiempo de vuelo en los cruces de umbral y calcula la altura mediante h = g × t² / 8. La fórmula supone una altura similar del centro de masas al despegar y aterrizar. El indicador de muestreo resume la frecuencia y la continuidad de los datos registrados en cada salto. El método requiere validación en un iPhone y contraste frente a una referencia antes de usar sus valores para calificar.

## Desarrollo

Sirve la raíz mediante un servidor HTTP local para usar la demo. El sensor real requiere un contexto seguro y permiso de movimiento concedido al pulsar el botón. En producción, GitHub Pages sirve la raíz del repositorio. Al actualizar la app, cambia la versión de los recursos en el HTML y en el service worker a la vez.

## Modo gimnasio (v3)

La vista inicial reúne altura, progreso, avisos y controles de medición. El historial está en una pestaña aparte. El selector de saltos queda a mano y los ajustes de protocolo, alumno y grupo están en **Ajustes de la serie**. En **Señal y tiempo de vuelo** se pueden consultar los datos del último salto. El CSV incorpora la versión del detector para identificar las medidas de esta actualización.

La detección exige una señal estable y continua antes de armar cada intento. Una recuperación breve durante el vuelo se descarta y el aterrizaje se acepta tras observar un impacto y al menos 70 ms de señal sostenida por encima del umbral de recuperación. Se conserva la marca temporal del primer cruce y los 70 ms no se suman al tiempo de vuelo. Estos umbrales son heurísticos y necesitan contraste con saltos reales antes de usar la altura como medida de evaluación.

## v4 · Oposiciones

El modo Oposiciones es el predeterminado. Estima la altura en centímetros a partir del tiempo de vuelo. Admite un impulso e impacto más suaves y un vuelo de al menos 90 ms. La señal debe volver de forma sostenida al nivel de apoyo. Los umbrales se probaron con datos sintéticos. Para conocer el error real del iPhone, contrasta los mismos saltos con una referencia. Si las bases miden diferencia entre alcance de pie y alcance saltando, anota esa marca por separado.
