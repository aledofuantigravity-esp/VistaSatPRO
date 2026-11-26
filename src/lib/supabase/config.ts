// Comprueba si el entorno tiene credenciales reales de Supabase configuradas

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(
    url &&
      key &&
      url.startsWith('https://') &&
      !url.includes('tu-proyecto.supabase.co') &&
      key.length > 20
  );
}

export function isVapidConfigured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  return Boolean(pub && pub.length > 20 && !pub.startsWith('BEl62i...'));
}
