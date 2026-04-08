
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const csvPath = path.resolve(__dirname, '../../Docs/ExpedientesAbril.csv');

test('Carga y extracción de mensajes RabbitMQ', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Extractor de mensajes RabbitMQ').waitFor();

  // Subir el archivo CSV
  const fileInput = await page.locator('input[type="file"]');
  await fileInput.setInputFiles(csvPath);

  // Click en extraer
  await page.getByRole('button', { name: /extraer/i }).click();

  // Esperar a que aparezca la tabla
  await expect(page.getByText(/Mensajes RabbitMQ extraídos/)).toBeVisible({ timeout: 10000 });
  const rows = await page.locator('table tbody tr');
  await expect(rows).toHaveCountGreaterThan(0);

  // Probar el botón de copiar
  await page.getByRole('button', { name: /copiar todos los mensajes/i }).click();
  await expect(page.getByText('¡Copiado!')).toBeVisible();
});
