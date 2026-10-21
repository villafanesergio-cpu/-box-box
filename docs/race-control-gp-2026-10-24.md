# Race Control: tres fases del GP del 24/10/2026

GP N.º 9, sábado 24 de octubre de 2026 a las 15:00 (Argentina), San Lorenzo, Salta.
La fecha y el circuito se seleccionan normalmente: esta adaptación no crea eventos ni participantes.

## Operación

1. Seleccionar **Fase 1 · Sprint · 3 vueltas**, parrilla **Manual / según clasificación**. Cargar el orden de la clasificación de aproximadamente 15 minutos, confirmarlo y revisar/confirmar la parrilla. Cargar el resultado del sprint y guardarlo.
2. Seleccionar **Fase 2 · Carrera corta · 5 vueltas**, parrilla **Invertida del resultado anterior**. Revisar y confirmar la parrilla, cargar resultado y guardar. Repetir cinco veces. Los DNF se invierten según su posición registrada; los participantes sin resultado anterior quedan al final para revisión manual.
3. Seleccionar **Fase 3 · Final · 25% · parada obligatoria**. La parrilla vuelve a **Manual / según clasificación**. Registrar la clasificación a una vuelta, confirmarla y revisar/confirmar la parrilla. Después de la carrera, cargar resultados y elegir **Cumplió** o **No cumplió** en la parada de cada piloto, incluidos los DNF. No se permite guardar con revisiones pendientes.

La clasificación no otorga puntos. La selección de parada no observa el videojuego y no aplica sanciones automáticamente. Dirección de Carrera decide cualquier penalización usando los controles habituales. Se conserva el cálculo: participantes − posición + 1, ajuste manual y mínimo cero; DNF siempre cero.

La sugerencia de tipo ayuda a pasar de sprint a cinco cortas y final; el operador puede cambiarla para excepciones. No se obliga este formato a otras fechas. Invertir la final sigue siendo posible, pero requiere confirmación explícita. Las posiciones manuales se pueden ajustar antes de confirmar.

El historial muestra tipo, modo de parrilla, clasificación y revisiones de boxes. Las carreras previas aparecen como **Formato anterior (sin tipo registrado)**: no se deduce ni se rellena su fase. Al corregir resultados antiguos se conservan la parrilla original y sus metadatos nulos. La numeración continúa desde el máximo existente, incluso si hubo eliminaciones.

## Activación (pendiente; no ejecutada en producción)

1. Aplicar el contenido completo de `supabase/migrations/20261021164634_race_control_format.sql` en el entorno que se vaya a desplegar, primero en una base de prueba. Es una transacción: agrega una columna nullable a `races` y la función `save_race_control`; no actualiza filas, puntos, resultados, vistas ni políticas existentes. Puede ejecutarse nuevamente.
2. Verificar las políticas reales de las tablas en ese entorno: la función usa **SECURITY INVOKER**, exige usuario autenticado y respeta RLS. El rol autenticado necesita los permisos que Race Control ya usa para eventos, carreras, parrillas y resultados. No ampliar RLS para resolver fallos de permisos.
3. Integrar y desplegar la rama de aplicación después de la migración. La nueva interfaz necesita la función; si falta, muestra un error y conserva el editor, sin guardar parcialmente. El código anterior es compatible con la columna adicional.
4. Ensayar el recorrido en un entorno separado antes del evento. No usar jornadas históricas reales como datos de prueba.

Para revertir la interfaz, volver a la versión anterior; dejar la columna y la función para conservar cualquier metadata nueva. No eliminar resultados ni reescribir carreras históricas.

## Verificación reproducible

```bash
npm ci
npm test
npx playwright install chromium
npm run test:browser
NEXT_PUBLIC_SUPABASE_URL=https://boxbox-test.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-key npm run build
```

`npm test` verifica parrillas, fases, DNF, puntos, clasificación, parada obligatoria, migración idempotente y transacciones con PostgreSQL embebido (PGlite), incluyendo rollback ante error y respeto de RLS. Se revisaron en modo de solo lectura las columnas, restricciones, triggers y políticas del proyecto BoxBox: sus estados son texto y la escritura está limitada por `private.is_admin()`. La prueba aislada reproduce lectura pública y escritura de administradores, verifica ambos roles y usa un esquema mínimo con las columnas que consume Race Control; no sustituye un ensayo en un entorno completo separado.

`npm run test:browser` levanta Next.js y una API Supabase simulada exclusivamente local. Recorre siete carreras, la final con clasificación y revisión de boxes, recarga del historial, corrección, rechazo de inversión accidental, compatibilidad con carreras antiguas y error de guardado. No usa credenciales ni datos de producción.
