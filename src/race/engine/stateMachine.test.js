import { describe, it, expect } from 'vitest';
import { S, TERMINAL, VIABLE, CHEMOTACTIC, canTransition, transition } from './stateMachine.js';

describe('sperm state machine', () => {
  it('encodes the arming sequence', () => {
    expect(canTransition(S.UNCAP, S.CAPACITATING)).toBe(true);
    expect(canTransition(S.CAPACITATING, S.CAPACITATED)).toBe(true);
    expect(canTransition(S.CAPACITATED, S.HYPER)).toBe(true);
    expect(canTransition(S.HYPER, S.AR)).toBe(true);
    expect(canTransition(S.AR, S.FUSED)).toBe(true);
  });

  it('forbids fusing without capacitation — no shortcut exists', () => {
    expect(canTransition(S.UNCAP, S.FUSED)).toBe(false);
    expect(canTransition(S.UNCAP, S.CAPACITATED)).toBe(false);
    expect(canTransition(S.UNCAP, S.HYPER)).toBe(false);
    expect(canTransition(S.UNCAP, S.AR)).toBe(false);
    expect(canTransition(S.CAPACITATING, S.FUSED)).toBe(false);
    expect(canTransition(S.CAPACITATING, S.HYPER)).toBe(false);
    expect(canTransition(S.CAPACITATED, S.FUSED)).toBe(false);
    expect(canTransition(S.HYPER, S.FUSED)).toBe(false);
  });

  it('terminal states have no exits', () => {
    for (const t of TERMINAL) {
      for (const to of Object.values(S)) {
        expect(canTransition(t, to)).toBe(false);
      }
    }
    expect(TERMINAL.has(S.FUSED)).toBe(true);
    expect(TERMINAL.has(S.DEAD)).toBe(true);
    expect(TERMINAL.has(S.PREMATURE_AR)).toBe(true);
    expect(TERMINAL.has(S.EXPIRED)).toBe(true);
    expect(TERMINAL.has(S.FILTERED)).toBe(true);
    expect(TERMINAL.has(S.IMMOTILE)).toBe(true);
    expect(TERMINAL.has(S.DAMAGED)).toBe(true);
  });

  it('chemotactic permission is the armed window ONLY', () => {
    expect(CHEMOTACTIC.has(S.UNCAP)).toBe(false);
    expect(CHEMOTACTIC.has(S.CAPACITATING)).toBe(false);
    expect(CHEMOTACTIC.has(S.CAPACITATED)).toBe(true);
    expect(CHEMOTACTIC.has(S.HYPER)).toBe(true);
    expect(CHEMOTACTIC.has(S.EXPIRED)).toBe(false);
    expect(CHEMOTACTIC.has(S.PREMATURE_AR)).toBe(false);
  });

  it('premature AR and expiry are reachable only from armed states', () => {
    expect(canTransition(S.UNCAP, S.PREMATURE_AR)).toBe(false);
    expect(canTransition(S.CAPACITATING, S.PREMATURE_AR)).toBe(false);
    expect(canTransition(S.CAPACITATED, S.PREMATURE_AR)).toBe(true);
    expect(canTransition(S.HYPER, S.EXPIRED)).toBe(true);
    expect(canTransition(S.UNCAP, S.EXPIRED)).toBe(false);
  });

  it('VIABLE marks exactly the states with fertilizing potential ahead', () => {
    expect([...VIABLE].sort()).toEqual(
      [S.UNCAP, S.CAPACITATING, S.CAPACITATED, S.HYPER, S.AR].sort()
    );
  });

  it('transition() applies legal moves and records history', () => {
    const agent = { state: S.UNCAP, history: [] };
    transition(agent, S.CAPACITATING, 100, 'test');
    expect(agent.state).toBe(S.CAPACITATING);
    expect(agent.history).toHaveLength(1);
    expect(agent.history[0]).toMatchObject({ t: 100, from: S.UNCAP, to: S.CAPACITATING });
  });

  it('transition() throws on illegal moves', () => {
    const agent = { state: S.DEAD, history: [] };
    expect(() => transition(agent, S.FUSED, 0, 'necromancy')).toThrow(/illegal/);
    const agent2 = { state: S.UNCAP, history: [] };
    expect(() => transition(agent2, S.FUSED, 0, 'shortcut')).toThrow(/illegal/);
  });
});
