import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

// Bootstrap de la app: monta React en #root y falla claro si no existe. Se prueba
// con import dinámico + resetModules para ejercitar ambas ramas del guard.

describe('main.tsx', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('monta la app cuando existe #root', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    await import('../../web/src/main.tsx');

    // React renderiza de forma asíncrona; esperamos a que pinte el contenedor.
    await waitFor(() => expect(root.childNodes.length).toBeGreaterThan(0));
  });

  it('lanza un error claro si falta #root', async () => {
    // Sin #root en el DOM.
    await expect(import('../../web/src/main.tsx')).rejects.toThrow(
      'No se encontró el contenedor #root',
    );
  });
});
