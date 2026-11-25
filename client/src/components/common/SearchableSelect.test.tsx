import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchableSelect } from './SearchableSelect';

afterEach(cleanup);

describe('SearchableSelect', () => {
  it('filters options as the user types and selects the matching option with Enter', () => {
    const onChange = vi.fn();
    render(
      <SearchableSelect
        options={[
          { value: 'tech-1', label: 'أحمد - فني كهرباء', searchText: 'EMP-101' },
          { value: 'tech-2', label: 'محمود - فني ميكانيكا', searchText: 'EMP-102' },
        ]}
        value=""
        onChange={onChange}
        placeholder="ابحث عن الفني"
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'EMP-102' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'محمود - فني ميكانيكا' })).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('tech-2');
  });

  it('allows free typing for fields that accept custom values', () => {
    const onChange = vi.fn();
    render(
      <SearchableSelect
        options={[{ value: '50%', label: 'نصف (50%)' }]}
        value="50%"
        onChange={onChange}
        placeholder="مستوى الوقود"
        allowCustom
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '60%' } });

    expect(onChange).toHaveBeenCalledWith('60%');
    expect(input).toHaveProperty('value', '60%');
  });
});
