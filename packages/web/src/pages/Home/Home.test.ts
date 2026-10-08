import { describe, expect, it } from 'vitest';
import { greeting } from './Home.tsx';

describe('greeting', () => {
  it.each([
    [3, 'Working late'],
    [9, 'Good morning'],
    [14, 'Good afternoon'],
    [21, 'Good evening'],
  ])('%i:00 → %s', (h, text) => expect(greeting(h)).toBe(text));
});
