import { describe, expect, it } from 'vitest';
import { simulate } from '../../tools/balance/bot';
import { formatReport } from '../../tools/balance/report';

// El bot de equilibrio (npm run balance) tiene que seguir funcionando cuando cambie la simulacion.
describe('bot de equilibrio', () => {
  it('juega una partida corta y su informe es coherente', () => {
    const r = simulate(1, 120);
    expect(r.final.level).toBeGreaterThan(1);
    const days = Object.entries(r.levelDay).sort(([a], [b]) => Number(a) - Number(b)).map(([, d]) => d);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(days.every((d) => d >= 0 && d <= 120)).toBe(true);
    expect(formatReport([r])).toContain('Nivel 2 (día)');
  });
});
