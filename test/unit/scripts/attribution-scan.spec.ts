import { describe, expect, it } from 'vitest';
import { findAttributionHits, lineHasAttribution } from '../../../scripts/attribution-scan';

describe('attribution-scan matching', () => {
  describe('does not flag ordinary cursor pagination terminology', () => {
    const allowed = [
      'cursor?: string',
      'nextCursor: string | null',
      'function encodeCursor(bookingDate: Date, id: string): string {',
      'function decodeCursor(cursor: string): { bookingDate: Date; id: string } {',
      'const cursorFilter =',
      'Opaque pagination cursor',
      'database cursor',
      'cursor-based pagination',
      'options: { cursor?: string; limit: number },',
      'throw new Error("Invalid transaction cursor");',
    ];

    it.each(allowed)('allows %j', (line) => {
      expect(lineHasAttribution(line)).toBe(false);
    });
  });

  describe('flags explicit AI-tool attribution', () => {
    // Assemble samples at runtime so this file is not itself flagged by the repo scan.
    const prohibited = [
      ['Generated', 'by', 'Cursor'].join(' '),
      ['Built', 'with', 'Cursor', 'AI'].join(' '),
      ['Cursor', 'Agent', 'generated', 'this', 'file'].join(' '),
      ['cursor', 'agent'].join(''),
      ['Generated', 'by', 'Claude'].join(' '),
      ['Generated', 'by', 'ChatGPT'].join(' '),
      ['Generated', 'by', 'GitHub', 'Copilot'].join(' '),
      ['AI', 'generated'].join('-'),
      ['Co-authored-by:', 'Claude'].join(' '),
      ['Co-authored-by:', 'ChatGPT'].join(' '),
    ];

    it.each(prohibited)('blocks %j', (line) => {
      expect(lineHasAttribution(line)).toBe(true);
    });
  });

  it('reports deterministic multi-line hits', () => {
    const hitA = ['Generated', 'by', 'Cursor'].join(' ');
    const hitB = ['Co-authored-by:', 'Claude'].join(' ');
    const content = [
      'export type Page = { nextCursor: string | null };',
      hitA,
      'const x = 1;',
      hitB,
    ].join('\n');

    expect(findAttributionHits(content)).toEqual([
      { line: 2, text: hitA },
      { line: 4, text: hitB },
    ]);
  });
});
