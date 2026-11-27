import { expect, test, type Page } from '@playwright/test';

async function loginAsCoordinator(page: Page) {
  await page.goto('/login');
  const coordBtn = page.getByRole('button', { name: /Laura Navarro/i });
  await expect(coordBtn).toBeEnabled({ timeout: 25_000 });
  await coordBtn.click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Hola, Laura Navarro' })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe('VistaSatPRO — Flujos críticos E2E', () => {
  test.beforeAll(async ({ request }) => {
    await request.post('/api/demo', {
      data: { action: 'reset_demo' },
    });
  });

  test('1. Login demo, Dashboard con gráficos y cambio a Modo Oscuro', async ({ page }) => {
    await loginAsCoordinator(page);
    await expect(page.getByText('Partes por Estado')).toBeVisible();
    await expect(page.getByText('Evolución Últimos 14 Días')).toBeVisible();

    // Cambiar a Modo Oscuro desde el botón lateral
    await page.getByRole('button', { name: /Cambiar a modo oscuro/i }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Volver a claro
    await page.getByRole('button', { name: /Cambiar a modo claro/i }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('2. Crear parte con SLA, chat interno, material, firma, PDF y papelera/restauración', async ({
    page,
  }) => {
    await loginAsCoordinator(page);

    // Crear nuevo parte en 3 pasos
    await page.goto('/tasks/new');
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: /Siguiente/i }).click();

    await page.getByPlaceholder(/Impresora Ricoh/i).fill('Caldera Baxi E2E');
    await page.getByPlaceholder(/Describe síntomas/i).fill('Error de encendido intermitente en prueba E2E.');
    await page.getByRole('button', { name: 'Alta' }).click();
    await page.getByRole('button', { name: /Siguiente/i }).click();

    await page.getByRole('button', { name: /Crear Tarea/i }).click();
    await expect(page).toHaveURL(/\/tasks\/task-/);
    await expect(page.getByText('Caldera Baxi E2E')).toBeVisible();

    // Chat interno (M4)
    await page
      .getByPlaceholder(/Escribe un mensaje interno/i)
      .fill('Mensaje de coordinación E2E');
    await page.getByRole('button', { name: /Enviar/i }).click();
    await expect(page.getByText('Mensaje de coordinación E2E')).toBeVisible();

    // Añadir material
    await page.getByPlaceholder(/Pieza o material/i).fill('Válvula gas E2E');
    await page.getByRole('button', { name: 'Añadir material' }).click();
    await expect(page.getByText('Válvula gas E2E')).toBeVisible();

    // Capturar firma digital en canvas
    await page.getByRole('button', { name: /Firma Cliente/i }).click();
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + 20, box.y + 30);
      await page.mouse.down();
      await page.mouse.move(box.x + 120, box.y + 60);
      await page.mouse.up();
    }
    await page.getByPlaceholder(/María López/i).fill('Cliente E2E');
    await page.getByRole('button', { name: /Guardar firma/i }).click();
    await expect(page.getByText(/Firmado por: Cliente E2E/i)).toBeVisible();

    // Descargar PDF
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Descargar PDF/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('_parte_SAT.pdf');

    // Soft-delete con motivo -> Papelera -> Restaurar
    await page.getByRole('button', { name: /^Eliminar$/i }).click();
    await page.getByRole('button', { name: 'Parte duplicado' }).click();
    await page.getByRole('button', { name: /Enviar a Papelera/i }).click();
    await expect(page.getByText(/Parte eliminado \(en la papelera\)/i)).toBeVisible();

    // Verificar en /tasks pestaña Papelera y restaurar desde allí
    await page.goto('/tasks');
    await page.getByRole('button', { name: /Papelera/i }).click();
    await expect(page.getByText(/Parte duplicado/i).first()).toBeVisible();
    await page.getByRole('button', { name: /Restaurar/i }).first().click();
    await expect(page.getByText(/restaurado y devuelto a la lista activa/i)).toBeVisible();
  });

  test('3. Búsqueda global (Ctrl+K), Clientes completo e Informes PDF', async ({ page }) => {
    await loginAsCoordinator(page);

    // Búsqueda global
    await page.keyboard.press('Control+k');
    const searchInput = page.getByPlaceholder(/Buscar partes, clientes/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Daikin');
    await expect(page.getByText(/VS-2026-0001/i).first()).toBeVisible();
    await page.keyboard.press('Escape');

    // Clientes: ficha detallada + filtro ciudad
    await page.goto('/customers');
    await expect(page.getByText('Hotel Mirador Norte')).toBeVisible();
    await page.getByText('Hotel Mirador Norte').first().click();
    await expect(page.getByText(/Historial de Partes/i)).toBeVisible();
    await page.keyboard.press('Escape');

    // Informes: descarga PDF
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: /Informes Operativos SAT/i })).toBeVisible();
    const pdfPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Exportar PDF/i }).click();
    const reportPdf = await pdfPromise;
    expect(reportPdf.suggestedFilename()).toContain('VistaSatPRO_informe_SAT_');

    // Filtros guardados en /tasks (M8)
    await page.goto('/tasks');
    await page.getByRole('button', { name: /Guardar vista/i }).click();
    await page.getByPlaceholder(/Nombre del filtro favorito/i).fill('Vista E2E');
    await page.getByRole('button', { name: /Guardar favorito/i }).click();
    await expect(page.getByRole('button', { name: /★ Vista E2E/i })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /★ Vista E2E/i })).toBeVisible();
  });

  test('4. Flujos de Nueva Tarea por tipo: Instalación (cotejo + PDF), Incidencia CXC (S/N obl. + copias + piezas) y Tarea', async ({
    page,
  }) => {
    await loginAsCoordinator(page);

    // A) Instalación
    await page.goto('/tasks/new');
    await expect(page.getByRole('heading', { name: 'Nueva Tarea' })).toBeVisible();
    await page.getByRole('button', { name: /Instalación/i }).click();
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: /Siguiente/i }).click();

    await page.getByPlaceholder(/Ricoh IM C3500/i).fill('Multifunción Instalación E2E');
    await page.getByPlaceholder(/solicitud de instalación/i).fill('Instalación en planta 2 según pedido.');
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByRole('button', { name: /Crear Tarea/i }).click();

    await expect(page).toHaveURL(/\/tasks\/task-/);
    await expect(page.getByText('Checklist: Cotejo de Mercancía')).toBeVisible();
    await expect(page.getByText('Materiales / Piezas Empleadas')).toHaveCount(0);
    await expect(page.getByText('Usar Cámara')).toBeVisible();
    await expect(page.getByText('Subir de Galería')).toBeVisible();
    await page.getByRole('button', { name: /Cotejo Realizado/i }).click();
    await expect(page.getByText('Realizado', { exact: true }).first()).toBeVisible();

    const instPdfPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Parte de Instalación \(PDF\)/i }).click();
    const instPdf = await instPdfPromise;
    expect(instPdf.suggestedFilename()).toContain('_parte_instalacion.pdf');

    // B) Incidencia CXC (Nº de serie NO obligatorio al crear, SÍ obligatorio al cerrar; copias B/N y color; botón + piezas)
    await page.goto('/tasks/new');
    await page.getByRole('button', { name: /Incidencia CXC/i }).click();
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: /Siguiente/i }).click();

    await page.getByPlaceholder(/Describe la incidencia CXC/i).fill('Fallo unidad imagen CXC.');
    // Debe permitir avanzar SIN nº de serie al crear
    await expect(page.getByRole('button', { name: /Siguiente/i })).toBeEnabled();

    await page.getByPlaceholder('Ej. 45200').fill('12500');
    await page.getByPlaceholder('Ej. 18400').fill('4300');
    await page.getByPlaceholder('Pieza 1').fill('Tambor negro CXC');
    await page.getByRole('button', { name: /Añadir pieza/i }).first().click();
    await page.getByPlaceholder('Pieza 2').fill('Tóner amarillo CXC');

    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByRole('button', { name: /Crear Tarea/i }).click();

    await expect(page).toHaveURL(/\/tasks\/task-/);
    await expect(page.getByText('Tambor negro CXC')).toBeVisible();
    await expect(page.getByText('Tóner amarillo CXC')).toBeVisible();

    // Intentar cerrar sin nº de serie debe bloquearlo
    await page.getByRole('button', { name: /Cerrar Incidencia/i }).click();
    await expect(
      page.getByText(/obligatorio introducir y guardar primero el Nº de Serie/i).first()
    ).toBeVisible();

    // Rellenar nº de serie en la pantalla de detalle y ahora sí cerrar
    await page.getByPlaceholder(/SN-CXC-90412/i).fill('SN-CXC-E2E-001');
    await page.getByRole('button', { name: /Guardar datos CXC/i }).click();
    await expect(page.getByText('S/N: SN-CXC-E2E-001')).toBeVisible();

    await page.getByRole('button', { name: /Cerrar Incidencia/i }).click();
    await expect(page.getByText('Completada').first()).toBeVisible();

    // C) Tarea general
    await page.goto('/tasks/new');
    await page.getByRole('button', { name: /^Tarea\b/i }).click();
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByPlaceholder(/Describe la tarea a realizar/i).fill('Revisar stock almacén E2E.');
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByRole('button', { name: /Crear Tarea/i }).click();
    await expect(page).toHaveURL(/\/tasks\/task-/);
    await expect(page.getByText('Revisar stock almacén E2E.')).toBeVisible();
  });

  test('5. Sección Instalaciones (sin fecha vs con fecha) y menú Más en móvil', async ({
    page,
  }) => {
    await loginAsCoordinator(page);

    // Crear una instalación sin fecha acordada para probar el flujo completo en /installations
    await page.goto('/tasks/new?type=installation');
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByPlaceholder(/Ricoh IM C3500/i).fill('Equipo Sin Fecha E2E');
    await page.getByPlaceholder(/solicitud de instalación/i).fill('Pendiente acordar fecha E2E.');
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByRole('button', { name: /Crear Tarea/i }).click();
    await expect(page).toHaveURL(/\/tasks\/task-/);

    await page.goto('/installations');
    await expect(page.getByRole('heading', { name: 'Instalaciones' })).toBeVisible();
    await expect(
      page.getByText(/Pendientes de asignar fecha de instalación/i)
    ).toBeVisible();
    await expect(page.getByText(/Instalaciones con fecha de instalación/i)).toBeVisible();
    await expect(page.getByText('Equipo Sin Fecha E2E')).toBeVisible();

    // Asignar fecha desde /installations
    await page.getByRole('button', { name: /Asignar fecha/i }).first().click();
    await page.locator('input[type="datetime-local"]').fill('2027-01-15T10:30');
    await page.getByRole('button', { name: /Guardar fecha/i }).click();
    await expect(page.getByText(/Fecha acordada asignada/i)).toBeVisible();

    // Verificar en vista móvil que está el botón Más y muestra las tarjetas ocultas
    await page.setViewportSize({ width: 390, height: 844 });
    const moreBtn = page.getByRole('button', { name: 'Más opciones' });
    await expect(moreBtn).toBeVisible();
    await moreBtn.click();
    await expect(page.getByText('Más secciones')).toBeVisible();
    await expect(page.getByRole('link', { name: /Clientes/i }).last()).toBeVisible();
    await expect(page.getByRole('link', { name: /Mi Perfil/i }).last()).toBeVisible();
  });

  test('6. Seguridad HTTP, CSP sin errores, /api/health minimizado y política de contraseñas', async ({
    page,
    request,
  }) => {
    const cspErrors: string[] = [];
    page.on('console', (msg) => {
      if (
        msg.type() === 'error' &&
        /Content Security Policy|Refused to execute|Refused to frame/i.test(msg.text())
      ) {
        cspErrors.push(msg.text());
      }
    });

    const healthRes = await request.get('/api/health');
    expect(healthRes.status()).toBe(200);
    const healthJson = (await healthRes.json()) as Record<string, unknown>;
    expect(healthJson.status).toBe('ok');
    expect(healthJson).not.toHaveProperty('supabaseConfigured');
    expect(healthJson).not.toHaveProperty('pushConfigured');

    const loginRes = await page.goto('/login');
    expect(loginRes).not.toBeNull();
    const headers = loginRes!.headers();
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).toContain("object-src 'none'");

    await loginAsCoordinator(page);
    await page.goto('/profile');
    await expect(
      page.getByRole('button', { name: /Cerrar sesión en todos los dispositivos/i })
    ).toBeVisible();
    await expect(page.getByText(/mín\. 10, letras y números/i)).toBeVisible();
    expect(cspErrors).toEqual([]);
  });

  test('7. Admin configura notificaciones y Push por usuario en /users y bloqueo en /profile', async ({
    page,
  }) => {
    await page.goto('/login');
    const adminBtn = page.getByRole('button', { name: /Carlos Mendoza/i });
    await expect(adminBtn).toBeEnabled({ timeout: 25_000 });
    await adminBtn.click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto('/users');
    await expect(page.getByRole('heading', { name: /Equipo y Usuarios/i })).toBeVisible();

    // Seleccionar usuario Javier Ruiz y abrir la pestaña Notificaciones y Push
    const techCard = page
      .locator('div.bg-white, div.dark\\:bg-surface')
      .filter({ hasText: 'Javier Ruiz' })
      .filter({ hasText: 'tecnico@vistalegre.com' })
      .first();
    await techCard.getByRole('button', { name: /Editar/i }).click();

    await expect(page.getByRole('heading', { name: /Editar Usuario · Javier Ruiz/i })).toBeVisible();
    await page.getByRole('button', { name: /Notificaciones y Push$/i }).last().click();
    await page.getByRole('button', { name: /Solo Urgencias/i }).click();
    await page.getByRole('button', { name: /Guardar cambios/i }).click();

    // Verificar en la tarjeta que muestra el nuevo resumen configurado por el Admin
    await expect(techCard.getByText(/Push: Solo Urgentes/i)).toBeVisible();

    // Iniciar sesión como Javier Ruiz y comprobar que /profile es 100% solo lectura en notificaciones y Push
    await page.goto('/profile');
    await page
      .getByRole('main')
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    await page.getByRole('button', { name: /Javier Ruiz/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await page.goto('/profile');
    await expect(
      page.getByText(/Configuración asignada por el Administrador/i)
    ).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: /Mensajes en el chat interno por Push/i })
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: /Activar Push en este dispositivo/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Guardar preferencias de avisos/i })
    ).toHaveCount(0);
  });

  test('8. Finalizar instalación: diálogo de parte físico (Sí con foto y No sin foto) + PDF', async ({
    page,
  }) => {
    await loginAsCoordinator(page);

    // PNG válido de 2x2 píxeles para pruebas de subida
    const samplePng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
      'base64'
    );

    // Caso A: Finalizar instalación eligiendo "No, cerrar sin foto"
    await page.goto('/tasks/new?type=installation');
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByPlaceholder(/Ricoh IM C3500/i).fill('Instalación Sin Parte Físico E2E');
    await page.getByPlaceholder(/solicitud de instalación/i).fill('Prueba cierre sin foto física.');
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByRole('button', { name: /Crear Tarea/i }).click();
    await expect(page).toHaveURL(/\/tasks\/task-/);

    await page.getByRole('button', { name: /Finalizar Instalación/i }).click();
    await expect(
      page.getByText(/¿Deseas añadir una foto del parte de trabajo físico antes de finalizar\?/i)
    ).toBeVisible();
    await page.getByRole('button', { name: /No, cerrar sin foto/i }).click();

    await expect(page.getByText('No se ha adjuntado parte de trabajo físico')).toBeVisible();
    await expect(page.getByText('Completada').first()).toBeVisible();

    // Caso B: Finalizar instalación eligiendo "Sí, añadir foto" (galería) y descargar PDF
    await page.goto('/tasks/new?type=installation');
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByPlaceholder(/Ricoh IM C3500/i).fill('Instalación Con Parte Físico E2E');
    await page.getByPlaceholder(/solicitud de instalación/i).fill('Prueba cierre con foto física.');
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByRole('button', { name: /Crear Tarea/i }).click();
    await expect(page).toHaveURL(/\/tasks\/task-/);

    await page.getByRole('button', { name: /Finalizar Instalación/i }).click();
    await page.getByRole('button', { name: /Sí, añadir foto/i }).click();
    await expect(page.getByText(/Usar Cámara/i).last()).toBeVisible();
    await expect(page.getByText(/Galería de Fotos/i)).toBeVisible();

    // Adjuntar imagen en el input de galería del diálogo
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type="file"]').last().setInputFiles({
      name: 'parte-fisico-firmado.png',
      mimeType: 'image/png',
      buffer: samplePng,
    });
    await expect(dialog.getByText('parte-fisico-firmado.png')).toBeVisible();
    await dialog.getByRole('button', { name: /Subir y Finalizar Instalación/i }).click();

    await expect(page.getByRole('heading', { name: /Parte de Trabajo Físico/i })).toBeVisible();
    await expect(page.getByText('parte-fisico-firmado.png', { exact: true })).toBeVisible();

    // Descargar PDF de instalación y comprobar que incrusta la imagen del parte físico
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Parte de Instalación \(PDF\)/i }).click(),
    ]);
    const pdfPath = await download.path();
    expect(pdfPath).toBeTruthy();
    const fs = await import('fs');
    const pdfContent = fs.readFileSync(pdfPath!, 'latin1');
    expect(pdfContent.startsWith('%PDF-')).toBe(true);
    expect(pdfContent).toContain('/Subtype /Image');
  });

  test('9. PDF de Incidencia RMA incluye fotografías adjuntas en formato lineal', async ({
    page,
  }) => {
    await loginAsCoordinator(page);

    const samplePng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
      'base64'
    );

    await page.goto('/tasks/new');
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByPlaceholder(/Describe síntomas/i).fill('Pieza dañada con foto para PDF E2E.');
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByRole('button', { name: /Crear Tarea/i }).click();
    await expect(page).toHaveURL(/\/tasks\/task-/);

    await page
      .getByPlaceholder(/Descripción opcional antes de seleccionar foto/i)
      .fill('Fusor dañado en rodillo');
    await page.locator('input[type="file"][multiple]').setInputFiles({
      name: 'pieza-danada.png',
      mimeType: 'image/png',
      buffer: samplePng,
    });
    await expect(page.getByText('Fusor dañado en rodillo', { exact: true })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Descargar PDF/i }).click(),
    ]);
    const pdfPath = await download.path();
    expect(pdfPath).toBeTruthy();
    const fs = await import('fs');
    const pdfContent = fs.readFileSync(pdfPath!, 'latin1');
    expect(pdfContent.startsWith('%PDF-')).toBe(true);
    expect(pdfContent).toContain('/Subtype /Image');
  });

  test('10. Panel General diferenciado (Admin vs Técnico), KPIs clicables, tiempo medio por tipo y móvil sin scroll horizontal', async ({
    page,
  }) => {
    // 1. Vista Administrador (Carlos Mendoza)
    await page.goto('/login');
    const adminBtn = page.getByRole('button', { name: /Carlos Mendoza/i });
    await expect(adminBtn).toBeEnabled({ timeout: 25_000 });
    await adminBtn.click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Hola, Carlos Mendoza' })).toBeVisible();

    // No debe mostrarse la comparativa de Top 5 técnicos
    await expect(page.getByText(/Top 5 Técnicos/i)).toHaveCount(0);

    // Bloque estadístico de tiempo medio de cierre por tipo de parte
    const avgSection = page
      .locator('section')
      .filter({
        has: page.getByRole('heading', { name: /Tiempo Medio de Cierre por Tipo de Parte/i }),
      });
    await expect(avgSection).toBeVisible();
    await expect(avgSection.getByText('Incidencias RMA', { exact: true })).toBeVisible();
    await expect(avgSection.getByText('Incidencias CXC', { exact: true })).toBeVisible();
    await expect(avgSection.getByText('Instalaciones', { exact: true })).toBeVisible();
    await expect(avgSection.getByText('Tareas', { exact: true })).toBeVisible();

    // Las 4 gráficas en escritorio
    await expect(page.getByRole('heading', { name: 'Evolución Últimos 14 Días' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Distribución por Tipo de Parte' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Partes por Estado' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Salud SLA y Prioridades' })).toBeVisible();

    // KPIs interactivos clicables (Pendientes, En Curso, Urgentes / Alta)
    await page.getByRole('button', { name: /Pendientes \/ Asignados/i }).click();
    await expect(
      page.getByRole('region', { name: /Partes Pendientes \/ Asignados/i })
    ).toBeVisible();

    await page.getByRole('button', { name: /En Curso \/ Camino/i }).click();
    await expect(
      page.getByRole('region', { name: /Partes En Curso \/ En Camino/i })
    ).toBeVisible();

    await page.getByRole('button', { name: /Urgentes \/ Alta/i }).first().click();
    const urgentRegion = page.getByRole('region', {
      name: /Partes Urgentes y Prioridad Alta/i,
    });
    await expect(urgentRegion).toBeVisible();

    // Navegar desde el drill-down a /tasks con el filtro aplicado
    await urgentRegion.getByRole('link', { name: /Ver en Tareas/i }).first().click();
    await expect(page).toHaveURL(/\/tasks\?preset=urgent_high/);
    await expect(
      page.getByText(/Filtro rápido desde Panel General: Urgentes y Prioridad Alta/i)
    ).toBeVisible();

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Partes Aún No Cerrados' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Instalaciones con Fecha Asignada' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Instalaciones Pendientes de Fecha' })
    ).toBeVisible();

    // Comprobar en smartphone (390x844) cero scroll horizontal en Admin
    await page.setViewportSize({ width: 390, height: 844 });
    const adminNoOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    );
    expect(adminNoOverflow).toBe(true);

    // 2. Vista Técnico (Javier Ruiz)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/profile');
    await page
      .getByRole('main')
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    await page.getByRole('button', { name: /Javier Ruiz/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Hola, Javier Ruiz' })).toBeVisible();

    // El técnico no ve las gráficas ejecutivas, ve directamente sus bloques prioritarios
    await expect(page.getByText(/Tiempo Medio de Cierre por Tipo de Parte/i)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Mis Partes Aún No Cerrados' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Mis Instalaciones con Fecha Asignada' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Mis Instalaciones Sin Fecha Asignada' })
    ).toBeVisible();

    // Comprobar en smartphone (390x844) cero scroll horizontal en Técnico
    await page.setViewportSize({ width: 390, height: 844 });
    const techNoOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    );
    expect(techNoOverflow).toBe(true);
  });

  test('11. Autoasignación automática al crear parte cuando solo hay un técnico activo', async ({
    page,
  }) => {
    await page.goto('/login');
    const adminBtn = page.getByRole('button', { name: /Carlos Mendoza/i });
    await expect(adminBtn).toBeEnabled({ timeout: 25_000 });
    await adminBtn.click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // Desactivar temporalmente a Marta Soler para dejar solo a Javier Ruiz como único técnico activo
    await page.goto('/users');
    const martaCard = page
      .locator('div.bg-white, div.dark\\:bg-surface')
      .filter({ hasText: 'Marta Soler' })
      .filter({ hasText: 'marta.soler@vistalegre.com' })
      .first();
    await martaCard.getByRole('button', { name: /Desactivar/i }).click();
    await expect(martaCard.getByRole('button', { name: /^Activar$/i })).toBeVisible();

    try {
      await page.goto('/tasks/new');
      await page.locator('select').first().selectOption({ index: 1 });
      await page.getByRole('button', { name: /Siguiente/i }).click();
      await page
        .getByPlaceholder(/Describe síntomas/i)
        .fill('Parte con autoasignación a técnico único.');
      await page.getByRole('button', { name: /Siguiente/i }).click();

      await expect(
        page.getByText(/Asignación automática \(único técnico activo\)/i)
      ).toBeVisible();
      await expect(page.getByText(/Javier Ruiz/).first()).toBeVisible();

      await page.getByRole('button', { name: /Crear Tarea/i }).click();
      await expect(page).toHaveURL(/\/tasks\/task-/);
      await expect(page.getByText('Asignada').first()).toBeVisible();
      await expect(page.locator('select').first()).toHaveValue('user-tech-1');
    } finally {
      // Restaurar a Marta Soler para no afectar al resto del entorno demo
      await page.goto('/users');
      const restoreCard = page
        .locator('div.bg-white, div.dark\\:bg-surface')
        .filter({ hasText: 'Marta Soler' })
        .filter({ hasText: 'marta.soler@vistalegre.com' })
        .first();
      const activateBtn = restoreCard.getByRole('button', { name: /^Activar$/i });
      if ((await activateBtn.count()) > 0) {
        await activateBtn.click();
        await expect(restoreCard.getByRole('button', { name: /Desactivar/i })).toBeVisible();
      }
    }
  });
});
