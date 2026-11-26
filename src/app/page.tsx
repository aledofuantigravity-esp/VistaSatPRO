import { redirect } from 'next/navigation';

// La raíz redirige al dashboard (el middleware en Fase 1 redirigirá a /login si no autenticado)
export default function RootPage() {
  redirect('/login');
}
