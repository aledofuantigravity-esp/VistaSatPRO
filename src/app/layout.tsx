import type { Metadata, Viewport } from 'next';
import { Montserrat } from 'next/font/google';
import './globals.css';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';

// ─── Tipografía corporativa Vistalegre ───────────────────────────────────────
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-montserrat',
  display: 'swap',
});

// ─── Metadatos ────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: {
    default: 'VistaSatPRO — Gestión SAT',
    template: '%s | VistaSatPRO',
  },
  description: 'Gestión integral de partes de trabajo y servicio técnico en campo.',
  applicationName: 'VistaSatPRO',
  authors: [{ name: 'Vistalegre Solutions' }],
  keywords: ['SAT', 'servicio técnico', 'partes de trabajo', 'gestión de reparaciones'],
  manifest: '/manifest.webmanifest',

  // iOS / Safari PWA
  appleWebApp: {
    capable: true,
    title: 'VistaSatPRO',
    statusBarStyle: 'black-translucent',
  },

  // Open Graph (por si se comparte el link)
  openGraph: {
    type: 'website',
    siteName: 'VistaSatPRO',
    title: 'VistaSatPRO — Gestión SAT',
    description: 'Gestión integral de partes de trabajo y servicio técnico en campo.',
  },

  // Iconos
  icons: {
    icon: [
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-180-apple.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { rel: 'mask-icon', url: '/icons/icon-source.svg', color: '#002169' },
    ],
  },

  // Forzar modo app en Android Chrome (antes de que se active el SW)
  other: {
    'mobile-web-app-capable': 'yes',
    'msapplication-TileColor': '#002169',
    'msapplication-tap-highlight': 'no',
  },
};

// ─── Viewport (separado de metadata en Next.js 15) ───────────────────────────
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#002169' },
    { media: '(prefers-color-scheme: dark)', color: '#1F2A44' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,          // Evita zoom automático en inputs en iOS
  userScalable: false,
  viewportFit: 'cover',    // Respeta notch (safe-area-inset)
};

// ─── Layout Raíz ─────────────────────────────────────────────────────────────
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={montserrat.variable}>
      <body className="font-montserrat antialiased bg-off-white text-charcoal">
        {children}
        {/* Registro del Service Worker — solo en cliente */}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
