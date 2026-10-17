import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { EscapeNavigation } from './EscapeNavigation';

const CurrentPath = () => {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
};

const renderAt = (path: string, children?: ReactNode) => render(
  <MemoryRouter initialEntries={[path]}>
    <EscapeNavigation />
    <Routes>
      <Route path="*" element={<><CurrentPath />{children}</>} />
    </Routes>
  </MemoryRouter>,
);

afterEach(cleanup);

describe('EscapeNavigation', () => {
  it('navigates to the parent route from a nested page', () => {
    renderAt('/workshop/job-cards/123');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByTestId('current-path').textContent).toBe('/workshop/job-cards');
  });

  it('does not navigate when Escape is used in a text field', () => {
    renderAt('/workshop/job-cards/123', <input aria-label="ملاحظات" />);

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'ملاحظات' }), { key: 'Escape' });

    expect(screen.getByTestId('current-path').textContent).toBe('/workshop/job-cards/123');
  });

  it('closes the active dialog before navigating', () => {
    const onClose = vi.fn();
    renderAt('/workshop/job-cards/123', (
      <section role="dialog" aria-modal="true">
        <button type="button" aria-label="إغلاق" onClick={onClose}>إغلاق</button>
      </section>
    ));

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByTestId('current-path').textContent).toBe('/workshop/job-cards/123');
  });
});
