# VistaSatPRO

**PWA de Gestión Integral de Servicio Técnico (SAT)**  
Stack: Next.js 15 · TypeScript · Tailwind CSS · Supabase · Vercel

---

## Estado del Proyecto

| Fase | Estado | Descripción |
|------|--------|-------------|
| Fase 0 | ✅ Completada | Scaffold, PWA base, identidad Vistalegre, iconos, SW, offline |
| Fase 1 | ⏳ Pendiente | Auth Supabase, RBAC, navegación, perfiles |
| Fase 2 | ⏳ Pendiente | Clientes, tareas, audit trail, adjuntos, PDF |
| Fase 3 | ⏳ Pendiente | Push notifications, centro de notificaciones in-app |
| Fase 4 | ⏳ Pendiente | Panel admin, informes, offline sync, modo oscuro |
| Fase 5 | ⏳ Pendiente | QA integral, producción, Vercel deploy |

---

## Inicio rápido (desarrollo)

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

## Generar iconos PWA

```bash
node scripts/generate-icons.mjs
```

Requiere `sharp` (ya incluido en devDependencies).

---

## Variables de entorno

Crea un fichero `.env.local` en la raíz con:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...  # Solo en Edge Functions / backend
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BNxx...
VAPID_PRIVATE_KEY=xxxx...
VAPID_SUBJECT=mailto:admin@tuempresa.com
```

---

## Verificación PWA (Lighthouse)

1. Construye y sirve en producción local:
   ```bash
   npm run build
   npm run start
   ```
2. Abre Chrome DevTools → Lighthouse → "Progressive Web App"
3. Criterios objetivo: Score ≥ 90, Installable ✅, PWA Optimized ✅

---

## Paleta de colores (tokens Vistalegre)

| Token | HEX | Uso |
|-------|-----|-----|
| `navy` | `#002169` | Primario — headers, Tab Bar |
| `magenta` | `#CF095E` | Acento — FAB, CTAs, urgente |
| `petrol` | `#004876` | Estado "Asignada" / "En Proceso" |
| `plum` | `#5E3654` | Estado "En Espera" |
| `coral` | `#EA7267` | Prioridad Media |
| `success` | `#1A7A4A` | Estado "Completada" |
| `danger` | `#D40000` | Prioridad "Urgente" |

---

## Arquitectura de directorios

```
src/
├── app/
│   ├── (auth)/login/        # Pantalla de login
│   ├── dashboard/           # Panel principal (post-auth)
│   ├── tasks/               # [Fase 2] Partes de trabajo
│   ├── customers/           # [Fase 2] Clientes
│   ├── users/               # [Fase 1] Gestión de usuarios (admin)
│   ├── notifications/       # [Fase 3] Centro de notificaciones
│   └── profile/             # [Fase 1] Perfil de usuario
├── components/
│   ├── pwa/                 # ServiceWorkerRegistration, InstallBanner, OfflineBanner...
│   ├── ui/                  # Button, Badge, TaskCard, Avatar... [Fase 1+]
│   ├── layout/              # TabBar, Sidebar, Header... [Fase 1]
│   └── tasks/               # TaskDetail, AuditTrail, SignaturePad... [Fase 2]
├── hooks/
│   ├── usePWAInstall.ts     # Hook de instalación PWA
│   ├── useAuth.ts           # [Fase 1] Hook de autenticación
│   └── useNotifications.ts  # [Fase 3] Hook de notificaciones
└── lib/
    ├── supabase/            # [Fase 1] Cliente Supabase
    └── types/               # [Fase 1+] Tipos TypeScript
```
