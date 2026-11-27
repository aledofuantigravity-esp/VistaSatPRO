import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Montserrat } from 'next/font/google';
import './globals.css';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';
import { AuthProvider } from '@/hooks/useAuth';
import { NotificationsProvider } from '@/hooks/useNotifications';
import { ThemeProvider } from '@/hooks/useTheme';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-montserrat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'VistaSatPRO — Gestión SAT',
    template: '%s | VistaSatPRO',
  },
  description: 'Gestión integral de partes de trabajo y servicio técnico en campo.',
  applicationName: 'VistaSatPRO',
  authors: [{ name: 'Vistalegre Solutions' }],
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  keywords: ['SAT', 'servicio técnico', 'partes de trabajo', 'gestión de reparaciones'],
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'VistaSatPRO',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    type: 'website',
    siteName: 'VistaSatPRO',
    title: 'VistaSatPRO — Gestión SAT',
    description: 'Gestión integral de partes de trabajo y servicio técnico en campo.',
  },
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
  other: {
    'mobile-web-app-capable': 'yes',
    'msapplication-TileColor': '#002169',
    'msapplication-tap-highlight': 'no',
  },
};

export const viewport: Viewport = {
  themeColor: '#002169',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Leer x-nonce fuerza renderizado dinámico por petición para aplicar CSP con nonce único
  const reqHeaders = await headers();
  const nonce = reqHeaders.get('x-nonce') || undefined;

  return (
    <html
      lang="es"
      className={montserrat.variable}
      data-csp-nonce={nonce ? 'active' : undefined}
      suppressHydrationWarning
    >
      <body className="font-montserrat antialiased bg-off-white text-charcoal transition-colors">
        <ThemeProvider>
          <AuthProvider>
            <NotificationsProvider>{children}</NotificationsProvider>
          </AuthProvider>
        </ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
