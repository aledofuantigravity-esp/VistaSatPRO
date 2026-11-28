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

  test('1. Login demo, Dashboard con gráficos y modo claro fijo (sin opción de modo oscuro)', async ({
    page,
  }) => {
    await loginAsCoordinator(page);
    await expect(page.getByText('Partes por Estado')).toBeVisible();
    await expect(page.getByText('Evolución Últimos 14 Días')).toBeVisible();

    // Siempre modo claro y sin botón de modo oscuro
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: /modo oscuro/i })).toHaveCount(0);

    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Apariencia' })).toHaveCount(0);
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

    // Descargar PDF (elegir PDF Interno en diálogo selector)
    await page.getByRole('button', { name: /Descargar PDF/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /PDF Interno/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('_parte_SAT_interno.pdf');

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

    await page.getByRole('button', { name: /Parte de Instalación \(PDF\)/i }).click();
    const instPdfPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /PDF para Cliente/i }).click();
    const instPdf = await instPdfPromise;
    expect(instPdf.suggestedFilename()).toContain('_parte_instalacion_cliente.pdf');

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
    await expect(page.getByRole('heading', { name: /Fechas y Tiempo del Parte/i })).toBeVisible();
    await expect(page.getByTestId('task-elapsed-duration')).toHaveText(/\d+\s+días?,\s+\d+\s+horas?/i);
    await expect(page.getByText('Tambor negro CXC')).toBeVisible();
    await expect(page.getByText('Tóner amarillo CXC')).toBeVisible();

    // Intentar cerrar sin nº de serie debe bloquearlo
    await page.getByRole('button', { name: /Cerrar Incidencia/i }).click();
    await expect(
      page.getByText(/obligatorio introducir y guardar primero el Nº de Serie/i).first()
    ).toBeVisible();

    // Rellenar nº de serie en la pantalla de detalle; sin resolución sigue bloqueado el cierre
    await page.getByPlaceholder(/SN-CXC-90412/i).fill('SN-CXC-E2E-001');
    await page.getByRole('button', { name: /Guardar datos CXC/i }).click();
    await expect(page.getByText('S/N: SN-CXC-E2E-001')).toBeVisible();

    await page.getByRole('button', { name: /Cerrar Incidencia/i }).click();
    await expect(
      page.getByText(/obligatorio indicar la resolución del problema/i).first()
    ).toBeVisible();

    await page
      .getByLabel('Resolución del problema')
      .fill('Sustituido fusor y calibrado alimentador de papel CXC.');
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
    await expect(page.getByRole('heading', { name: /Fechas y Tiempo del Parte/i })).toBeVisible();
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
    await expect(dialog).toBeHidden();

    await expect(page.getByRole('heading', { name: /Parte de Trabajo Físico/i })).toBeVisible();
    await expect(page.getByText('parte-fisico-firmado.png', { exact: true })).toBeVisible();

    // Descargar PDF de instalación (copia Cliente) y comprobar que incrusta la imagen del parte físico
    await page.getByRole('button', { name: /Parte de Instalación \(PDF\)/i }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /PDF para Cliente/i }).click(),
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

    await page.getByRole('button', { name: /Descargar PDF/i }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /PDF para Cliente/i }).click(),
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

    // KPIs interactivos clicables (Pendientes, En Proceso, Urgentes / Alta)
    await page.getByRole('button', { name: /Pendientes.*Por iniciar/i }).click();
    await expect(
      page.getByRole('region', { name: /^Partes Pendientes$/i })
    ).toBeVisible();

    await page.getByRole('button', { name: /En Proceso.*Actualmente en curso/i }).click();
    await expect(
      page.getByRole('region', { name: /^Partes En Proceso$/i })
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
      await expect(page.getByText('Pendiente').first()).toBeVisible();
      await expect(page.locator('select').first()).toHaveValue('user-tech-1');

      // Comprobar que solo existen exactamente los 4 estados en el selector
      await page.getByRole('button', { name: /Cambiar Estado/i }).click();
      await expect(page.getByRole('heading', { name: 'Actualizar Estado del Parte' })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Asignada/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^En Camino/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^En Espera/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Pendiente/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^En Proceso/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Completada/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Cancelada/i })).toBeVisible();
      await page.getByRole('button', { name: /En Proceso/i }).click();
      await expect(page.getByText('En Proceso').first()).toBeVisible();

      // Al rellenar la resolución y pulsar Cerrar Parte pasa automáticamente a Completada
      await page
        .getByLabel('Resolución del problema')
        .fill('Sustituida bomba hidráulica y verificada presión nominal.');
      await page.getByRole('button', { name: /Cerrar Parte/i }).click();
      await expect(page.getByText('Completada').first()).toBeVisible();
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

  test('12. Calendario visual de Instalaciones, exportación .ics y móvil sin scroll horizontal', async ({
    page,
  }) => {
    await loginAsCoordinator(page);
    await page.goto('/installations');
    await expect(page.getByRole('heading', { name: 'Instalaciones' })).toBeVisible();

    // Conmutar a vista Calendario
    await page.getByRole('button', { name: /^Calendario$/i }).click();
    await expect(page.getByRole('button', { name: /^Hoy$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Mes$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Semana$/i })).toBeVisible();

    // Comprobar calendario en móvil 390x844 sin scroll horizontal
    await page.setViewportSize({ width: 390, height: 844 });
    const calNoOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    );
    expect(calNoOverflow).toBe(true);

    // Volver a escritorio y descargar archivo .ics desde la vista Lista en el bloque con fecha asignada
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('button', { name: /^Lista$/i }).click();
    const icsPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /\.ics/i }).first().click();
    const icsDownload = await icsPromise;
    expect(icsDownload.suggestedFilename()).toContain('_instalacion.ics');
    const icsPath = await icsDownload.path();
    expect(icsPath).toBeTruthy();
    const fs = await import('fs');
    const icsText = fs.readFileSync(icsPath!, 'utf8');
    expect(icsText).toContain('BEGIN:VCALENDAR');
    expect(icsText).toContain('BEGIN:VEVENT');
  });

  test('13. Catálogo de repuestos + autocompletado, acciones en lote en Tareas e Informes mejorados', async ({
    page,
  }) => {
    await loginAsCoordinator(page);

    // A) Crear un repuesto en /parts
    await page.goto('/parts');
    await expect(page.getByRole('heading', { name: /Catálogo de Repuestos/i })).toBeVisible();
    await page.getByRole('button', { name: /Nuevo Repuesto/i }).click();
    await page.getByPlaceholder(/Fusor Ricoh IM C3500/i).fill('Kit Rodillo E2E');
    await page.getByPlaceholder(/FUS-400/i).fill('REF-E2E-99');
    await page.getByRole('button', { name: /^Guardar$/i }).click();
    await expect(page.getByText('Kit Rodillo E2E')).toBeVisible();
    await expect(page.getByText('Ref: REF-E2E-99')).toBeVisible();

    // B) Usar autocompletado al añadir material en un parte RMA existente
    await page.goto('/tasks/new');
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByPlaceholder(/Describe síntomas/i).fill('Prueba catálogo repuestos y lote E2E.');
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByRole('button', { name: /Crear Tarea/i }).click();
    await expect(page).toHaveURL(/\/tasks\/task-/);

    const matInput = page.getByPlaceholder(/Pieza o material/i);
    await matInput.click();
    await matInput.fill('Kit Rodillo');
    await page.getByRole('button', { name: /Kit Rodillo E2E/i }).click();
    await expect(page.getByPlaceholder('Ref. (opc.)')).toHaveValue('REF-E2E-99');
    await page.getByRole('button', { name: 'Añadir material' }).click();
    await expect(page.getByText('Kit Rodillo E2E')).toBeVisible();
    await expect(page.getByText('Ref: REF-E2E-99')).toBeVisible();

    // C) Acciones en lote en /tasks
    await page.goto('/tasks');
    await page.locator('input[type="checkbox"]').first().check();
    await expect(page.getByText(/1 parte seleccionado/i)).toBeVisible();
    await page.getByLabel('Cambiar prioridad en lote').selectOption('high');
    await page.getByRole('button', { name: /Aplicar lote/i }).click();
    await expect(page.getByText(/Actualización en lote aplicada/i)).toBeVisible();

    // D) Informes: sin gráfica comparativa por técnico, con tiempos medios por tipo y repuestos consumidos
    await page.goto('/reports');
    await expect(page.getByText(/Comparativa Visual por Técnico/i)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: /Tiempo Medio de Cierre por Tipo de Parte/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Repuestos Más Consumidos/i })
    ).toBeVisible();
    await expect(page.getByText('Kit Rodillo E2E')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /CSV Completo \(Partes y Materiales\)/i })
    ).toBeVisible();
  });

  test('14. Notas técnicas acumulativas (más reciente arriba + usuario + fecha/hora) y resolución obligatoria al cerrar salvo Instalaciones', async ({
    page,
  }) => {
    await loginAsCoordinator(page);

    // A) Incidencia RMA: notas acumulativas y resolución obligatoria
    await page.goto('/tasks/new');
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByPlaceholder(/Impresora Ricoh/i).fill('Equipo RMA Notas y Resolución E2E');
    await page.getByPlaceholder(/Describe síntomas/i).fill('Comprobación E2E notas y resolución.');
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByRole('button', { name: /Crear Tarea/i }).click();
    await expect(page).toHaveURL(/\/tasks\/task-/);

    await expect(page.getByRole('heading', { name: /Fechas y Tiempo del Parte/i })).toBeVisible();
    await expect(page.getByText('Pendiente de cierre')).toBeVisible();
    await expect(page.getByTestId('task-elapsed-duration')).toHaveText(/\d+\s+días?,\s+\d+\s+horas?/i);

    await expect(
      page.getByRole('heading', { name: /Notas Técnicas e Incidencias/i })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Resolución$/i })).toBeVisible();
    await expect(page.getByText('Obligatoria al cerrar')).toBeVisible();

    // Registrar 2 notas consecutivas
    const noteBox = page.getByLabel('Nueva nota técnica o incidencia');
    await noteBox.fill('Primera nota técnica E2E');
    await page.getByRole('button', { name: /Guardar nota/i }).click();
    await expect(page.getByTestId('technical-note-item')).toHaveCount(1);

    await noteBox.fill('Segunda nota más reciente E2E');
    await page.getByRole('button', { name: /Guardar nota/i }).click();
    const noteItems = page.getByTestId('technical-note-item');
    await expect(noteItems).toHaveCount(2);

    // La más reciente debe aparecer arriba con usuario y fecha/hora
    await expect(noteItems.nth(0)).toContainText('Segunda nota más reciente E2E');
    await expect(noteItems.nth(0)).toContainText('Laura Navarro');
    await expect(noteItems.nth(0)).toContainText(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
    await expect(noteItems.nth(1)).toContainText('Primera nota técnica E2E');
    await expect(noteItems.nth(1)).toContainText('Laura Navarro');

    // Bloqueo al cerrar por botón y por Cambiar Estado -> Completada sin resolución
    await page.getByRole('button', { name: /Cerrar Parte/i }).click();
    await expect(
      page.getByText(/obligatorio indicar la resolución del problema/i).first()
    ).toBeVisible();

    await page.getByRole('button', { name: /Cambiar Estado/i }).click();
    await page.getByRole('button', { name: /^Completada/i }).click();
    await expect(
      page.getByText(/obligatorio indicar la resolución del problema/i).first()
    ).toBeVisible();

    // Escribir resolución y pulsar Cerrar Parte directamente (guardado automático + cierre)
    await page
      .getByLabel('Resolución del problema')
      .fill('Sustituido módulo de control y test OK.');
    await page.getByRole('button', { name: /Cerrar Parte/i }).click();
    await expect(page.getByText('Completada').first()).toBeVisible();
    await expect(page.getByText('Registrada', { exact: true })).toBeVisible();
    await expect(page.getByText('Pendiente de cierre')).toHaveCount(0);
    await expect(page.getByText('Duración (apertura → cierre)')).toBeVisible();
    await expect(page.getByTestId('task-elapsed-duration')).toHaveText(/\d+\s+días?,\s+\d+\s+horas?/i);

    // Persistencia tras recargar
    await page.reload();
    await expect(page.getByTestId('technical-note-item').nth(0)).toContainText(
      'Segunda nota más reciente E2E'
    );
    await expect(page.getByLabel('Resolución del problema')).toHaveValue(
      'Sustituido módulo de control y test OK.'
    );

    // B) Parte de Instalación: admite notas ordenadas pero NO muestra ni exige Resolución
    await page.goto('/tasks/new?type=installation');
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByPlaceholder(/Ricoh IM C3500/i).fill('Instalación Notas Sin Resolución E2E');
    await page.getByPlaceholder(/solicitud de instalación/i).fill('Prueba instalación notas.');
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByRole('button', { name: /Crear Tarea/i }).click();
    await expect(page).toHaveURL(/\/tasks\/task-/);

    await expect(page.getByRole('heading', { name: /Fechas y Tiempo del Parte/i })).toBeVisible();
    await expect(page.getByText('Pendiente de cierre')).toBeVisible();
    await expect(page.getByTestId('task-elapsed-duration')).toHaveText(/\d+\s+días?,\s+\d+\s+horas?/i);

    await expect(
      page.getByRole('heading', { name: /Notas Técnicas e Incidencias/i })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Resolución$/i })).toHaveCount(0);

    const instNoteBox = page.getByLabel('Nueva nota técnica o incidencia');
    await instNoteBox.fill('Incidencia instalación inicial E2E');
    await page.getByRole('button', { name: /Guardar nota/i }).click();
    await expect(page.getByTestId('technical-note-item')).toHaveCount(1);
    await instNoteBox.fill('Nota final instalación E2E');
    await page.getByRole('button', { name: /Guardar nota/i }).click();
    await expect(page.getByTestId('technical-note-item').nth(0)).toContainText(
      'Nota final instalación E2E'
    );
    await expect(page.getByTestId('technical-note-item').nth(0)).toContainText('Laura Navarro');

    await page.getByRole('button', { name: /Finalizar Instalación/i }).click();
    await page.getByRole('button', { name: /No, cerrar sin foto/i }).click();
    await expect(page.getByText('Completada').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Fechas y Tiempo del Parte/i })).toBeVisible();
    await expect(page.getByText('Duración (apertura → cierre)')).toBeVisible();
  });

  test('15. Selector PDF Cliente vs Interno y rejilla profesional con notas e historial', async ({
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
    await page.getByPlaceholder(/Impresora Ricoh/i).fill('Equipo Selector PDF Dual E2E');
    await page.getByPlaceholder(/Describe síntomas/i).fill('Comprobación PDF Cliente e Interno.');
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByRole('button', { name: /Crear Tarea/i }).click();
    await expect(page).toHaveURL(/\/tasks\/task-/);

    // Añadir nota técnica interna, resolución, material y 2 fotos
    await page
      .getByLabel('Nueva nota técnica o incidencia')
      .fill('Nota interna confidencial SAT para validar tamaño diferencial del PDF.');
    await page.getByRole('button', { name: /Guardar nota/i }).click();
    await expect(page.getByTestId('technical-note-item')).toHaveCount(1);

    await page
      .getByLabel('Resolución del problema')
      .fill('Sustituida fuente de alimentación y equipo operativo.');
    await page.getByRole('button', { name: /Guardar resolución/i }).click();
    await expect(page.getByText('Registrada', { exact: true })).toBeVisible();

    await page.locator('input[type="file"][multiple]').setInputFiles([
      { name: 'foto-1.png', mimeType: 'image/png', buffer: samplePng },
      { name: 'foto-2.png', mimeType: 'image/png', buffer: samplePng },
    ]);
    await expect(page.getByText('Fotografías (2)')).toBeVisible();

    // 1) Abrir diálogo y descargar PDF para Cliente
    await page.getByRole('button', { name: /Descargar PDF/i }).click();
    await expect(page.getByRole('heading', { name: /Descargar Parte en PDF/i })).toBeVisible();
    const [clientDl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /PDF para Cliente/i }).click(),
    ]);
    expect(clientDl.suggestedFilename()).toContain('_parte_SAT_cliente.pdf');
    await expect(page.getByRole('heading', { name: /Descargar Parte en PDF/i })).toHaveCount(0);

    // 2) Abrir diálogo y descargar PDF Interno (Completo)
    await page.getByRole('button', { name: /Descargar PDF/i }).click();
    const [internalDl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /PDF Interno/i }).click(),
    ]);
    expect(internalDl.suggestedFilename()).toContain('_parte_SAT_interno.pdf');

    const fs = await import('fs');
    const clientPath = await clientDl.path();
    const internalPath = await internalDl.path();
    expect(clientPath).toBeTruthy();
    expect(internalPath).toBeTruthy();
    const clientBuf = fs.readFileSync(clientPath!);
    const internalBuf = fs.readFileSync(internalPath!);
    expect(clientBuf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(internalBuf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(clientBuf.toString('latin1')).toContain('/Subtype /Image');
    expect(internalBuf.length).toBeGreaterThan(clientBuf.length);
  });
});
