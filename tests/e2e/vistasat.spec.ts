import { expect, test, type Page } from '@playwright/test';

async function loginAsCoordinator(page: Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  const coordBtn = page.getByRole('button', { name: /Laura Navarro/i });
  await expect(coordBtn).toBeEnabled({ timeout: 15_000 });
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
    await page.getByRole('button', { name: /Cotejo Realizado/i }).click();
    await expect(page.getByText('Realizado', { exact: true }).first()).toBeVisible();

    const instPdfPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Parte de Instalación \(PDF\)/i }).click();
    const instPdf = await instPdfPromise;
    expect(instPdf.suggestedFilename()).toContain('_parte_instalacion.pdf');

    // B) Incidencia CXC (Nº de serie obligatorio, copias B/N y color, botón + piezas)
    await page.goto('/tasks/new');
    await page.getByRole('button', { name: /Incidencia CXC/i }).click();
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: /Siguiente/i }).click();

    await page.getByPlaceholder(/Describe la incidencia CXC/i).fill('Fallo unidad imagen CXC.');
    // Sin nº de serie, Siguiente debe seguir deshabilitado
    await expect(page.getByRole('button', { name: /Siguiente/i })).toBeDisabled();

    await page.getByPlaceholder(/SN-CXC-90412/i).fill('SN-CXC-E2E-001');
    await page.getByPlaceholder('Ej. 45200').fill('12500');
    await page.getByPlaceholder('Ej. 18400').fill('4300');
    await page.getByPlaceholder('Pieza 1').fill('Tambor negro CXC');
    await page.getByRole('button', { name: /Añadir pieza/i }).first().click();
    await page.getByPlaceholder('Pieza 2').fill('Tóner amarillo CXC');

    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page.getByRole('button', { name: /Crear Tarea/i }).click();

    await expect(page).toHaveURL(/\/tasks\/task-/);
    await expect(page.getByText('S/N: SN-CXC-E2E-001')).toBeVisible();
    await expect(page.getByText('Tambor negro CXC')).toBeVisible();
    await expect(page.getByText('Tóner amarillo CXC')).toBeVisible();

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
});
