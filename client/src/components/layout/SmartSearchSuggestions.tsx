import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';

const LIST_ID = 'smart-search-suggestions';

type Suggestion = { value: string; label: string };

export const SmartSearchSuggestions: React.FC = () => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const activeInput = useRef<HTMLInputElement | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    let timer: number | undefined;

    const loadSuggestions = (input: HTMLInputElement) => {
      window.clearTimeout(timer);
      const query = input.value.trim();
      const currentRequest = ++requestId.current;
      if (!query) {
        setSuggestions([]);
        return;
      }

      timer = window.setTimeout(async () => {
        try {
          const response = await api.getSmartSearchSuggestions(query);
          if (requestId.current === currentRequest) setSuggestions(response.suggestions);
        } catch (error) {
          console.error('Failed to load field suggestions:', error);
          if (requestId.current === currentRequest) setSuggestions([]);
        }
      }, 180);
    };

    const handleFocus = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!['text', 'search', 'email', 'tel', 'url'].includes(target.type)) return;
      if (target.disabled || target.readOnly || target.dataset.noSmartSearch === 'true') return;
      activeInput.current = target;
      if (!target.hasAttribute('list')) target.setAttribute('list', LIST_ID);
      loadSuggestions(target);
    };

    const handleInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target !== activeInput.current) return;
      loadSuggestions(target);
    };

    const handleBlur = (event: FocusEvent) => {
      if (event.target !== activeInput.current) return;
      window.clearTimeout(timer);
      activeInput.current = null;
      requestId.current += 1;
      setSuggestions([]);
    };

    document.addEventListener('focusin', handleFocus);
    document.addEventListener('input', handleInput);
    document.addEventListener('focusout', handleBlur);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('input', handleInput);
      document.removeEventListener('focusout', handleBlur);
    };
  }, []);

  return (
    <datalist id={LIST_ID}>
      {suggestions.map((suggestion) => (
        <option key={`${suggestion.value}-${suggestion.label}`} value={suggestion.value} label={suggestion.label} />
      ))}
    </datalist>
  );
};
