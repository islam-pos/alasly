import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const EscapeNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
      const activeDialog = dialogs.item(dialogs.length - 1);
      if (activeDialog) {
        const closeButton = activeDialog.querySelector<HTMLButtonElement>('[aria-label="إغلاق"]');
        if (closeButton) {
          event.preventDefault();
          closeButton.click();
        }
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement
        && (target.isContentEditable || target.matches('input, textarea, select, [contenteditable="true"]'))) return;

      event.preventDefault();
      if (typeof window.history.state?.idx === 'number' && window.history.state.idx > 0) {
        navigate(-1);
        return;
      }

      const parentPath = location.pathname.split('/').slice(0, -1).join('/') || '/';
      if (parentPath !== location.pathname) navigate(parentPath);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [location.pathname, navigate]);

  return null;
};
