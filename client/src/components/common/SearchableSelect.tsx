import React, { useId, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export type SearchableSelectOption = {
  value: string;
  label: string;
  searchText?: string;
};

type SearchableSelectProps = {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  allowClear?: boolean;
  allowCustom?: boolean;
};

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  allowClear = false,
  allowCustom = false,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selectedOption = options.find((option) => option.value === value);
  const displayValue = selectedOption?.label || (allowCustom ? value : '');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = options.filter((option) =>
    `${option.label} ${option.searchText || ''}`.toLocaleLowerCase().includes(normalizedQuery),
  );

  const selectOption = (option: SearchableSelectOption) => {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setQuery(displayValue);
    } else if (event.key === 'Enter' && open && filteredOptions.length > 0) {
      event.preventDefault();
      selectOption(filteredOptions[0]);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          value={open ? query : displayValue}
          onFocus={() => {
            setQuery('');
            setOpen(true);
          }}
          onBlur={() => {
            setOpen(false);
            setQuery(displayValue);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (allowCustom) onChange(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-xl border border-slate-200 bg-white p-2.5 pr-9 font-bold text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-slate-100"
        />
        {allowClear && value && !disabled ? (
          <button
            type="button"
            aria-label="مسح الاختيار"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange('');
              setQuery('');
              setOpen(false);
            }}
            className="absolute left-8 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <ChevronDown className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>

      {open && !disabled && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
        >
          {filteredOptions.length > 0 ? filteredOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
              className={`block w-full rounded-lg px-3 py-2 text-right text-xs hover:bg-brand-50 ${
                option.value === value ? 'bg-brand-50 font-bold text-brand-700' : 'text-slate-700'
              }`}
            >
              {option.label}
            </button>
          )) : (
            <p className="px-3 py-2 text-xs text-slate-500">لا توجد نتائج مطابقة</p>
          )}
        </div>
      )}
    </div>
  );
};
