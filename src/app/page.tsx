import { redirect } from 'next/navigation';

// La raíz redirige al panel (proxy.ts redirigirá a /login si no hay sesión)
export default function RootPage() {
  redirect('/dashboard');
}
