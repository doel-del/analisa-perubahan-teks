// ============================================================
// SMOKE TEST — SHARED_PREDICATE_DUPLICATE_SPLIT (END-TO-END)
// ============================================================
// Tujuan: memverifikasi jalur INTEGRASI PRODUCTION SUNGGUHAN --
// bukan reimplementasi logika di file test -- benar-benar
// menyelesaikan bug silent-data-loss yang ditemukan di audit
// (lihat changelog_prompts.md, Addendum 28 Agustus 2026 & Addendum 3).
//
// Alur yang diuji (SEMUA fungsi production asli, tidak ada mock
// logic bisnis):
//
//   rawOutput (FIXED, dari EXP-E run-01.json -- data nyata,
//              bukan karangan)
//     -> parseEvidenceJSON()              [production-pipeline.ts]
//     -> isValidEvidence() filter         [server.ts, diekspor]
//     -> EvidenceValidator.validate()     [evidence-validator.ts]
//     -> assignEvidenceIds()              [server.ts, diekspor]
//     -> DuplicateValidator.detect()      [duplicate.ts]
//     -> resolveDuplicateActions()        [server.ts, diekstrak+diekspor]
//     -> finalEvidence
//
// rawOutput SENGAJA di-hardcode (bukan panggil Gemini asli) supaya
// test ini deterministik -- pola SHARED_PREDICATE_DUPLICATE_SPLIT
// hanya muncul 30-100% tergantung chunk (lihat rangkuman audit,
// bagian 2), jadi test yang bergantung API asli bisa "kebetulan
// lolos" tanpa benar-benar menguji jalur integrasi.
//
// chunkText di bawah ini disalin PERSIS dari
// targeted-regression-007-expe.srt (fixture EXP-E) dan cocok
// byte-per-byte dengan chunkText di EXP-E run-01.json yang sudah
// diaudit.
// ============================================================

import { describe, test, expect } from 'vitest';
import { parseSRT, buildEvidenceChunks, parseEvidenceJSON } from '../../production-pipeline';
import { EvidenceValidator } from '../../validators/evidence-validator';
import { DuplicateValidator } from '../../validators/duplicate';
import type { EvidenceContext, EvidenceItem, EvidenceValidationReport } from '../../types';
import {
  isValidEvidence,
  assignEvidenceIds,
  resolveDuplicateActions
} from '../../../../server';

// ------------------------------------------------------------
// FIXTURE — targeted-regression-007-expe.srt, disalin persis
// ------------------------------------------------------------

const EXP_E_SRT = `1
00:00:00,000 --> 00:00:03,500
Sekarang membahas sektor kamera secara umum.

2
00:00:03,500 --> 00:00:08,000
kamera selfie dan ultrawide yang perlu peningkatan, terutama di kondisi low light.`;

// ------------------------------------------------------------
// RAW OUTPUT — disalin PERSIS dari EXP-E run-01.json
// (Hasil Tes EXP-E.md), bukan data karangan. Ini output Gemini
// asli yang sudah terbukti mengandung SHARED_PREDICATE_DUPLICATE_SPLIT.
// ------------------------------------------------------------

const EXP_E_RAW_OUTPUT = `[
  {
    "evidence_id": "E001",
    "topic": "camera",
    "subtopic": "selfie",
    "type": "OPINION",
    "claim": "Reviewer menilai kamera selfie perlu peningkatan, terutama di kondisi low light.",
    "value": null,
    "unit": null,
    "context": "kondisi low light",
    "comparison_target": null,
    "reviewer_assessment": "negative",
    "certainty": "explicit",
    "source_excerpt": "kamera selfie dan ultrawide yang perlu peningkatan, terutama di kondisi low light"
  },
  {
    "evidence_id": "E002",
    "topic": "camera",
    "subtopic": "ultrawide",
    "type": "OPINION",
    "claim": "Reviewer menilai kamera ultrawide perlu peningkatan, terutama di kondisi low light.",
    "value": null,
    "unit": null,
    "context": "kondisi low light",
    "comparison_target": null,
    "reviewer_assessment": "negative",
    "certainty": "explicit",
    "source_excerpt": "kamera selfie dan ultrawide yang perlu peningkatan, terutama di kondisi low light"
  }
]`;

describe('SMOKE TEST — SHARED_PREDICATE_DUPLICATE_SPLIT end-to-end', () => {
  test('EXP-E rawOutput yang dialirkan lewat pipeline production TIDAK BOLEH kehilangan salah satu subjek (selfie/ultrawide)', () => {
    // --- 1. Parse SRT (production-pipeline.ts) ---
    const segments = parseSRT(EXP_E_SRT);
    expect(segments.length).toBe(2);

    // --- 2. Build chunk (production-pipeline.ts) ---
    // Fixture ini pendek, jadi seharusnya jadi satu chunk saja.
    const chunks = buildEvidenceChunks(segments, 18000, 3);
    expect(chunks.length).toBeGreaterThan(0);
    const chunk = chunks[0];

    // --- 3. Parse rawOutput (production-pipeline.ts) ---
    const parsedEvidence = parseEvidenceJSON(EXP_E_RAW_OUTPUT);
    expect(parsedEvidence).toHaveLength(2);

    // --- 4. Filter isValidEvidence (server.ts) ---
    const validEvidence = parsedEvidence.filter(isValidEvidence);
    expect(validEvidence).toHaveLength(2);

    // --- 5. EvidenceValidator.validate() per evidence (evidence-validator.ts) ---
    const context: EvidenceContext = {
      chunkIndex: 0,
      chunkText: EXP_E_SRT,
      chunkSegments: chunk
    };

    const allEvidence: EvidenceItem[] = [];
    for (const ev of validEvidence) {
      const report: EvidenceValidationReport = EvidenceValidator.validate(ev, context);

      // Sanity check: kedua evidence harus lolos validasi per-item
      // (grounding, provenance, assessment, value, atomicity) --
      // kalau salah satu ke-reject di sini, smoke test ini tidak
      // relevan lagi untuk menguji duplicate-gate.
      expect(report.accepted).toBe(true);

      allEvidence.push({ ...ev, validation: report });
    }
    expect(allEvidence).toHaveLength(2);

    // --- 6. Assign evidence IDs (server.ts) ---
    const identifiedEvidence = assignEvidenceIds(allEvidence);
    expect(identifiedEvidence.map(e => e.evidence_id)).toEqual(['E001', 'E002']);

    // --- 7. Duplicate gate (duplicate.ts, SUDAH DIPERBAIKI) ---
    const duplicateResult = DuplicateValidator.detect(identifiedEvidence);

    // --- 8. Resolusi (server.ts, diekstrak dari route handler asli) ---
    const { preservedEvidence, duplicateRemovedDetails, duplicateMergedDetails } =
      resolveDuplicateActions(identifiedEvidence, duplicateResult);

    // ============================================================
    // ASSERTION UTAMA — INI YANG MEMBUKTIKAN BUG SUDAH TERTUTUP
    // ============================================================

    // Harus jadi SATU evidence gabungan, BUKAN dua (silent duplicate)
    // dan BUKAN nol (silent data loss total).
    expect(preservedEvidence).toHaveLength(1);

    const merged = preservedEvidence[0];

    // Informasi KEDUA subjek harus tetap ada di claim gabungan --
    // ini yang membuktikan tidak ada silent data loss.
    expect(merged.claim?.toLowerCase()).toContain('selfie');
    expect(merged.claim?.toLowerCase()).toContain('ultrawide');

    // subtopic di-null-kan (mencakup >1 subjek, sesuai desain
    // buildMergedEvidence -- lihat ATURAN BARU #7, jangan paksakan
    // satu subtopic yang cuma mewakili sebagian proposisi).
    expect(merged.subtopic).toBeNull();
    expect(merged.merged_subtopics).toEqual(
      expect.arrayContaining(['selfie', 'ultrawide'])
    );
    expect(merged.merged_from_evidence_ids).toEqual(['E001', 'E002']);

    // Laporan resolusi harus tercatat di jalur MERGE, bukan REMOVED --
    // (memastikan API response nanti tidak salah melaporkan ini
    // sebagai "evidence dibuang").
    expect(duplicateMergedDetails).toHaveLength(1);
    expect(duplicateRemovedDetails).toHaveLength(0);

    // --- 9. Cek semantik stats.duplicateRemoved (server.ts) ---
    // CATATAN AUDIT: field ini bernama "duplicateRemoved" tapi
    // untuk kasus MERGE, tidak ada informasi yang benar-benar
    // dibuang -- cuma digabung. Assertion ini mendokumentasikan
    // perilaku SAAT INI secara eksplisit (bukan menyatakan
    // penamaannya ideal) supaya tidak ada yang salah paham nanti
    // saat baca response API.
    // Field stats.duplicateRemoved di API sudah diperbaiki (lihat rangkuman bagian 11.4 #7) 
    // -- variabel lokal ini murni ilustrasi selisih total, bukan lagi representasi field API.
    const duplicateRemovedCount = identifiedEvidence.length - preservedEvidence.length;
    expect(duplicateRemovedCount).toBe(1); // 2 evidence -> 1, dihitung sebagai "removed" meski sebenarnya di-merge
  });
});