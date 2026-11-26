# VistaSatPRO — PWA de Gestión Integral de Servicio Técnico (SAT)

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (PostgreSQL + RLS + Realtime + Storage + Edge Functions) · Web Push (VAPID) · Despliegue en Vercel

---

## Estado de Implementación

| Fase | Estado | Contenido implementado |
|---|---|---|
| Fase 0 | ✅ | PWA base (`manifest.webmanifest`, `sw.js`, 10 iconos + screenshots, `offline.html`, tokens Vistalegre, banners Android/iOS) |
| Fase 1 | ✅ | Autenticación dual (Supabase Auth + Modo Demo Local), RBAC (`admin`, `coordinator`, `technician`), Tab Bar móvil + Sidebar colapsable, `/users`, `/profile` |
| Fase 2 | ✅ | Clientes (`/customers`), Partes de trabajo (`/tasks`, `/tasks/new`, `/tasks/[id]`), código correlativo `VS-YYYY-XXXX`, Audit Trail inmutable, materiales, fotos cámara/galería, firma digital y generación PDF (`jsPDF`) |
| Fase 3 | ✅ | Centro de Notificaciones in-app (`/notifications`), campana Realtime, Web Push VAPID (`/api/push/send` + `supabase/functions/handle-task-event`), filtro estricto anti-autonotificación (`actor_id != recipient_id`) |
| Fase 4 | ✅ | Panel Coordinador con KPIs y gráficos, exportación CSV, informes (`/reports`), cola offline IndexedDB (`idb`) con sincronización automática |
| Fase 5 | ✅ | Proxy SSR, headers de seguridad HTTP, migración SQL completa con RLS/triggers, verificación TypeScript/ESLint/Build/Browser |

---

## Arranque Rápido en Local (Modo Demo)

Sin necesidad de configurar nada en Supabase, la aplicación arranca en **Modo Demo Local** persistente en `localStorage`:

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) y usa los botones de acceso rápido en `/login` (`Técnico`, `Coordinadora`, `Admin`) o inicia sesión con cualquiera de las cuentas demo (contraseña `demo1234`).

---

## Conexión a Producción (Supabase + Web Push + Vercel)

1. **Crear proyecto en Supabase** y ejecutar la migración SQL completa:
   - `supabase/migrations/0001_initial_schema.sql` (desde el SQL Editor de Supabase).
2. **Generar claves VAPID** para notificaciones Push reales:
   ```bash
   npx web-push generate-vapid-keys
   ```
3. **Configurar `.env.local`** (en local) o **Environment Variables** en Vercel copiando `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`
4. **Edge Function opcional (recomendada para triggers directos desde BD):**
   - Desplegar `supabase/functions/handle-task-event/index.ts` con `supabase functions deploy handle-task-event` y configurar los secrets VAPID en Supabase.
5. **Desplegar en Vercel** (HTTPS obligatorio para Service Worker y Web Push).

---

## Verificación de Calidad

```bash
npx tsc --noEmit
npm run lint
npm run build
```
