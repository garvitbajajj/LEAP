import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Difficulty, ProgressBar, skillLabel } from '../components/ui';

describe('design system', () => {
  test('ProgressBar clamps to 0-100 and is accessible', () => {
    render(<ProgressBar value={140} label="Path progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Path progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
  });

  test('Difficulty renders filled and empty pips', () => {
    const { container } = render(<Difficulty level={3} />);
    expect(container.textContent).toBe('●●●○○');
  });

  test('skillLabel formats skill slugs', () => {
    expect(skillLabel('data-wrangling')).toBe('Data Wrangling');
    expect(skillLabel('sql')).toBe('SQL');
    expect(skillLabel('html-css')).toBe('HTML & CSS');
  });
});
