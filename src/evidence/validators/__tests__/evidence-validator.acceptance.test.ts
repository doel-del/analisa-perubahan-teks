import { describe, test, expect } from 'vitest';
import { EvidenceValidator } from '../evidence-validator';
import type { EvidenceContext, EvidenceItem } from '../../types';

// Context untuk test
const context: EvidenceContext = {
  chunkIndex: 0,
  chunkText: 'Refresh rate 120Hz. Baterai 5000 mAh. Kamera 50 MP.',
  chunkSegments: [
    { index: 1, start: '00:00:01,000', end: '00:00:02,000', text: 'Refresh rate 120Hz' },
    { index: 2, start: '00:00:02,000', end: '00:00:03,000', text: 'Baterai 5000 mAh' },
    { index: 3, start: '00:00:03,000', end: '00:00:04,000', text: 'Kamera 50 MP' }
  ]
};

// Context ambiguous untuk grounding/provenance
const ambiguousContext: EvidenceContext = {
  chunkIndex: 0,
  chunkText: '6 generasi Android\n6 generasi Android',
  chunkSegments: [
    { index: 1, start: '00:00:01,000', end: '00:00:02,000', text: '6 generasi Android' },
    { index: 2, start: '00:00:02,000', end: '00:00:03,000', text: '6 generasi Android' }
  ]
};

describe('ACCEPTANCE POLICY MATRIX', () => {

  test('PASS + PASS → VALID', () => {
    const evidence: EvidenceItem = {
      type: 'FACT',
      claim: 'Refresh rate 120Hz',
      source_excerpt: 'Refresh rate 120Hz',
      reviewer_assessment: null,
      value: 120,
      unit: 'Hz'
    };
    const report = EvidenceValidator.validate(evidence, context);
    expect(report.accepted).toBe(true);
    expect(report.finalStatus).toBe('VALID');
    expect(evidence.source_coordinates).not.toBeNull();
  });

  test('MULTIPLE OCCURRENCE (no anchor) → PROVENANCE SUSPECT → QUARANTINE', () => {
    // Sebelum redesign (Stage 3-6), multiple lexical match ditandai
    // Grounding SUSPECT → quarantine dengan alasan 'GROUNDING'.
    // Setelah redesign, Grounding existence-only: multiple match = PASS.
    // Ambiguitas occurrence ditangani Provenance (Stage 4), dan
    // acceptance policy P0 sekarang men-quarantine karena PROVENANCE
    // SUSPECT (Stage 6). Attribution quarantine berpindah dari
    // GROUNDING ke PROVENANCE.
    const evidence: EvidenceItem = {
      type: 'FACT',
      claim: '6 generasi Android',
      source_excerpt: '6 generasi Android',
      reviewer_assessment: null
    };
    const report = EvidenceValidator.validate(evidence, ambiguousContext);
    expect(report.accepted).toBe(false);
    expect(report.finalStatus).toBe('QUARANTINE');
    expect(evidence.source_coordinates).toBeNull();
    expect(report.quarantineReason).toContain('PROVENANCE');
  });

  test('PROVENANCE SUSPECT → QUARANTINE', () => {
    // Setup ini sama dengan test di atasnya (multiple occurrence + no anchor).
    // Setelah Stage 5, hanya PROVENANCE yang SUSPECT (Grounding existence-only),
    // sehingga attribution quarantine konsisten: PROVENANCE SUSPECT.
    // Test ini menjaga coverage P0 invariant secara langsung.
    const evidence: EvidenceItem = {
      type: 'FACT',
      claim: '6 generasi Android',
      source_excerpt: '6 generasi Android',
      reviewer_assessment: null
    };
    const report = EvidenceValidator.validate(evidence, ambiguousContext);
    expect(report.accepted).toBe(false);
    expect(report.finalStatus).toBe('QUARANTINE');
    expect(evidence.source_coordinates).toBeNull();
  });

  test('GROUNDING FAIL → QUARANTINE', () => {
    const evidence: EvidenceItem = {
      type: 'FACT',
      claim: 'Baterai 6000 mAh',
      source_excerpt: 'tidak ada di chunk',
      reviewer_assessment: null
    };
    const report = EvidenceValidator.validate(evidence, context);
    expect(report.accepted).toBe(false);
    expect(report.finalStatus).toBe('QUARANTINE');
    expect(evidence.source_coordinates).toBeNull();
    expect(report.quarantineReason).toContain('GROUNDING');
  });

  test('PROVENANCE FAIL → QUARANTINE', () => {
    const evidence: EvidenceItem = {
      type: 'FACT',
      claim: 'Baterai 6000 mAh',
      source_excerpt: 'tidak ada di chunk',
      reviewer_assessment: null
    };
    const report = EvidenceValidator.validate(evidence, context);
    expect(report.accepted).toBe(false);
    expect(report.finalStatus).toBe('QUARANTINE');
  });

  test('VALUE SUSPECT → VALID_WITH_NORMALIZATION', () => {
    // Simulasi VALUE SUSPECT: numeric ratio yang tidak dikenal
    const evidence: EvidenceItem = {
      type: 'FACT',
      claim: 'Aspect ratio 16/9',
      source_excerpt: 'Aspect ratio 16/9',
      reviewer_assessment: null,
      value: '16/9',
      unit: null
    };
    // Kita perlu context yang punya excerpt ini
    const contextWithRatio: EvidenceContext = {
      chunkIndex: 0,
      chunkText: 'Aspect ratio 16/9',
      chunkSegments: [
        { index: 1, start: '00:00:01,000', end: '00:00:02,000', text: 'Aspect ratio 16/9' }
      ]
    };
    const report = EvidenceValidator.validate(evidence, contextWithRatio);
    // VALUE SUSPECT seharusnya tetap accepted, tapi status VALID_WITH_NORMALIZATION
    expect(report.accepted).toBe(true);
    expect(report.finalStatus).toBe('VALID_WITH_NORMALIZATION');
  });

  test('ATOMICITY SUSPECT → VALID_WITH_NORMALIZATION', () => {
    const evidence: EvidenceItem = {
      type: 'FACT',
      claim: 'RAM 8 GB dan storage 256 GB',
      source_excerpt: 'RAM 8 GB dan storage 256 GB',
      reviewer_assessment: null
    };
    const contextWithCompound: EvidenceContext = {
      chunkIndex: 0,
      chunkText: 'RAM 8 GB dan storage 256 GB',
      chunkSegments: [
        { index: 1, start: '00:00:01,000', end: '00:00:02,000', text: 'RAM 8 GB dan storage 256 GB' }
      ]
    };
    const report = EvidenceValidator.validate(evidence, contextWithCompound);
    expect(report.accepted).toBe(true);
    expect(report.finalStatus).toBe('VALID_WITH_NORMALIZATION');
  });

  test('ASSESSMENT FAIL → QUARANTINE', () => {
    const evidence: EvidenceItem = {
      type: 'FACT',
      claim: 'Refresh rate 120Hz',
      source_excerpt: 'Refresh rate 120Hz',
      reviewer_assessment: 'positive' // FACT tidak boleh punya assessment
    };
    const report = EvidenceValidator.validate(evidence, context);
    expect(report.accepted).toBe(false);
    expect(report.finalStatus).toBe('QUARANTINE');
    expect(report.quarantineReason).toContain('ASSESSMENT');
  });

  test('ALL PASS → VALID', () => {
    const evidence: EvidenceItem = {
      type: 'FACT',
      claim: 'Baterai 5000 mAh',
      source_excerpt: 'Baterai 5000 mAh',
      reviewer_assessment: null,
      value: 5000,
      unit: 'mAh'
    };
    const report = EvidenceValidator.validate(evidence, context);
    expect(report.accepted).toBe(true);
    expect(report.finalStatus).toBe('VALID');
    expect(evidence.source_coordinates).not.toBeNull();
  });
});
