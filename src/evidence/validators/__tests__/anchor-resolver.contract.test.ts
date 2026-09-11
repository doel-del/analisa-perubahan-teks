// ============================================================
// CONTRACT TEST — ANCHOR-BASED PROVENANCE RESOLVER
// ============================================================
// STATUS: Implementasi resolver SUDAH ADA di ../anchor-resolver.ts
// (Stage 2). GroundingValidator BELUM diubah menjadi existence-only
// (Stage 5) — dua test grounding di bagian bawah masih diharapkan RED.
//
// ARSITEKTUR (dikunci audit ronde 2 — poin 1 & 11):
// `resolveProvenanceAnchor()` BUKAN validator keempat yang berdiri
// sejajar dengan Grounding/Provenance. Ia adalah mekanisme resolusi
// INTERNAL yang dipanggil DARI DALAM `ProvenanceValidator.resolve()`.
// Public governance interface tetap satu: ProvenanceValidator.
//
//     findSourceMatches()  → lexical occurrences (tidak berubah)
//              ↓
//     GroundingValidator   → existence only
//              ↓
//     ProvenanceValidator.resolve()
//              ↓
//         resolveProvenanceAnchor()   ← internal, TIDAK diekspor
//              ↓                        ke evidence-validator.ts
//         coordinates / AMBIGUOUS
//
// Modul ini TIDAK didaftarkan di validators/index.ts sebagai peer
// Grounding/Provenance — mencegah proliferasi validator yang
// membuat ownership kabur (audit poin 1 & 11).
//
// DECISION TABLE FINAL (dikunci audit ronde 2, poin 12):
//
//   | Lexical matches | Anchor  | Candidate didukung | Result      |
//   |-----------------:|---------|--------------------:|-------------|
//   |                0 | apa pun |                   — | FAIL        |
//   |                1 | null    |                   1 | RESOLVED    |
//   |                1 | ada     |                   1 | RESOLVED    |
//   |               >1 | null    |                   0 | AMBIGUOUS   |
//   |               >1 | kosong  |                   0 | AMBIGUOUS   |
//   |               >1 | ada     |                   0 | AMBIGUOUS   |
//   |               >1 | ada     |                   1 | RESOLVED    |
//   |               >1 | ada     |                  >1 | AMBIGUOUS   |
//
//   Invariant: resolve() hanya boleh RESOLVED via anchor jika
//   cardinality(candidateSupport) === 1. Anchor bukan bukti
//   identitas jika anchor sendiri tidak diskriminatif (audit poin 3).
//
//   ANCHOR      = default `evidence.subtopic`, dicek dengan
//                 normalizeForMatching YANG SAMA dengan validator
//                 lain (tidak ada matcher baru/lokal, tidak ada
//                 alias semantic seperti selfie→"kamera depan").
//
//   KOORDINAT   = RESOLVED → non-null; AMBIGUOUS → null. Kontrak ini
//                 dikunci eksplisit (audit ronde 3) supaya downstream
//                 tidak salah memperlakukan coordinates sebagai klaim
//                 provenance saat status AMBIGUOUS.
//
// ------------------------------------------------------------
// KNOWN LIMITATION — ELIPSIS LINTAS SEGMEN
// ------------------------------------------------------------
// Resolver ini TIDAK melakukan coreference lintas-segmen, pewarisan
// subjek, atau resolusi antecedent. Jika subjek evidence diperkenalkan
// pada segmen lain dan tidak muncul literal di dalam candidate span,
// provenance tetap AMBIGUOUS dan evidence akan di-quarantine.
//
// Contoh nyata (test #5): "Perekaman videonya up to 1080p 30 fps."
// (seg 97) adalah lanjutan wacana dari "Ini adalah kamera selfie
// 13 MP..." (seg 96). Kata "selfie" TIDAK literal ada di seg 97.
// Resolver TIDAK boleh menyimpulkan "video ini milik selfie" dari
// kedekatan segmen — itu coreference, bukan occurrence disambiguation.
//
// Penyelesaian pola tersebut memerlukan layer subject-propagation /
// context-scope deterministik yang terpisah, dengan kontraknya sendiri.
// JANGAN menyelesaikannya dengan memperlebar anchor window di resolver
// ini — test #4/#5/#6 adalah tripwire aktif terhadap regresi tersebut.
//
// ------------------------------------------------------------
// HISTORICAL — RED-STATE WORKFLOW (sudah selesai)
// ------------------------------------------------------------
// Urutan yang ditempuh saat tahap desain:
//   (1) contract test ditulis dulu → RED-1 (modul belum ada)
//   (2) skeleton anchor-resolver.ts dibuat (body throw) → RED-2
//       (assertion gagal, bukan import gagal — membuktikan test
//        benar-benar menguji behavior)
//   (3) implementasi resolver → GREEN (Stage 2)
//   (4) integrasi ke ProvenanceValidator (Stage 4)
//   (5) GroundingValidator → existence-only (Stage 5)
//   (6) balik assertion di parallel-device-spec-ambiguity.test.ts
//   (7) full regression suite (78 test lama + contract test baru)
//
// Tahapan (1)–(3) sudah selesai. Blok ini dipertahankan sebagai
// catatan historis, bukan sebagai instruksi aktif.
// ============================================================

import { describe, test, expect } from 'vitest';
import { resolveProvenanceAnchor } from '../anchor-resolver';
import type { EvidenceContext } from '../../types';

// ------------------------------------------------------------
// FIXTURE — verbatim dari transcript.srt asli, segmen 95-103
// (sama seperti parallel-device-spec-ambiguity.test.ts, supaya
// hasil kedua file test bisa langsung dibandingkan satu sama lain)
// ------------------------------------------------------------

const context: EvidenceContext = {
  chunkIndex: 1,
  chunkSegments: [
    { index: 95, start: '00:05:09,129', end: '00:05:15,569', text: 'Lalu untuk di bezel atas layar ini, terdapat earpiece yang ditemani oleh kamera selfie dengan model waterdrop.' },
    { index: 96, start: '00:05:15,569', end: '00:05:20,569', text: 'Ini adalah kamera selfie 13 MP, bukaan f/2.2, fixed focus.' },
    { index: 97, start: '00:05:20,569', end: '00:05:24,129', text: 'Perekaman videonya up to 1080p 30 fps.' },
    { index: 98, start: '00:05:24,129', end: '00:05:27,610', text: 'Beralih ke sisi belakang, ini adalah 50 MP Main Camera.' },
    { index: 99, start: '00:05:27,610', end: '00:05:29,529', text: 'Bukaannya f/1.8, auto focus.' },
    { index: 100, start: '00:05:29,529', end: '00:05:35,089', text: 'Perekaman video bisa sampai 4K 30 fps dan ada pilihan juga untuk 1080p 60 fps.' },
    { index: 101, start: '00:05:35,089', end: '00:05:40,050', text: 'Kemudian untuk kamera berikutnya ada kamera ultrawide 8 MP, bukaan f/2.2.' },
    { index: 102, start: '00:05:40,050', end: '00:05:44,370', text: 'Ini fixed focus juga ya, perekaman videonya up to 1080p 30 fps.' },
    { index: 103, start: '00:05:44,370', end: '00:05:48,550', text: 'Kemudian ada kamera 2 MP macro camera dan ada LED flash.' }
  ],
  chunkText: [
    'Lalu untuk di bezel atas layar ini, terdapat earpiece yang ditemani oleh kamera selfie dengan model waterdrop.',
    'Ini adalah kamera selfie 13 MP, bukaan f/2.2, fixed focus.',
    'Perekaman videonya up to 1080p 30 fps.',
    'Beralih ke sisi belakang, ini adalah 50 MP Main Camera.',
    'Bukaannya f/1.8, auto focus.',
    'Perekaman video bisa sampai 4K 30 fps dan ada pilihan juga untuk 1080p 60 fps.',
    'Kemudian untuk kamera berikutnya ada kamera ultrawide 8 MP, bukaan f/2.2.',
    'Ini fixed focus juga ya, perekaman videonya up to 1080p 30 fps.',
    'Kemudian ada kamera 2 MP macro camera dan ada LED flash.'
  ].join(' ')
};

// Fixture kedua — kasus AMBIGUOUS lama (tanpa anchor pembeda sama
// sekali), untuk memastikan resolver TIDAK mengubah perilaku ini.
const ambiguousNoAnchorContext: EvidenceContext = {
  chunkIndex: 0,
  chunkSegments: [
    { index: 1, start: '00:00:01,000', end: '00:00:02,000', text: '6 generasi Android' },
    { index: 2, start: '00:00:02,000', end: '00:00:03,000', text: '6 generasi Android' }
  ],
  chunkText: '6 generasi Android\n6 generasi Android'
};

describe('CONTRACT — resolveProvenanceAnchor()', () => {

  // ==========================================================
  // LEVEL 1 — kasus terselesaikan lewat anchor (RESOLVED)
  // Anchor literal hadir di dalam candidate span.
  // ==========================================================

  test('1. selfie + "bukaan f/2.2" → resolve ke seg 96', () => {
    const result = resolveProvenanceAnchor('bukaan f/2.2', 'selfie', context);
    expect(result.status).toBe('RESOLVED');
    expect(result.coordinates).toEqual({
      chunk_index: 1,
      segment_start_index: 96,
      segment_end_index: 96,
      char_start: null,
      char_end: null
    });
  });

  test('2. ultrawide + "bukaan f/2.2" → resolve ke seg 101', () => {
    const result = resolveProvenanceAnchor('bukaan f/2.2', 'ultrawide', context);
    expect(result.status).toBe('RESOLVED');
    expect(result.coordinates?.segment_start_index).toBe(101);
    expect(result.coordinates?.segment_end_index).toBe(101);
  });

  test('3. selfie + "fixed focus" → resolve ke seg 96', () => {
    const result = resolveProvenanceAnchor('fixed focus', 'selfie', context);
    expect(result.status).toBe('RESOLVED');
    expect(result.coordinates?.segment_start_index).toBe(96);
  });

  // ==========================================================
  // LEVEL 2 — kasus yang WAJIB tetap AMBIGUOUS
  // ==========================================================

  // ----------------------------------------------------------
  // #4/#5/#6 — NEGATIVE CONTROL / ANTI-WINDOW-EXPANSION TRIPWIRE
  // ----------------------------------------------------------
  // Tiga test ini menutup celah antara invariant arsitektural
  // ("anchor hanya dicek terhadap candidate span itu sendiri")
  // dan godaan implementasi paling umum: memperlebar window di
  // sekitar candidate untuk menemukan anchor di segmen tetangga.
  //
  // Untuk masing-masing test:
  //   - anchor memang ada di chunk,
  //   - tetapi TIDAK berada di candidate span manapun,
  //   - pada salah satu candidate, anchor berada di segmen
  //     immediate predecessor (pola paling menggoda untuk
  //     "diperbaiki" via window backward-1).
  //
  // Resolver TIDAK boleh memperluas window, dalam arah apapun
  // dan sejauh apapun. Cross-segment subject propagation /
  // coreference bukan tanggung jawab resolver ini.
  //
  // Hasil yang benar: AMBIGUOUS + coordinates === null.
  //
  // Catatan cakupan: tiga test ini menangkap window expansion
  // arah backward pada radius yang umum (immediate predecessor
  // untuk ketiganya, sebagian 2-segmen untuk #5 karena "selfie"
  // juga muncul di seg 95). Window expansion arah lain atau
  // radius lebih besar mungkin tidak tertangkap di sini.
  // Pencegahan utama tetap invariant arsitektural di header
  // anchor-resolver.ts, bukan tripwire test ini.
  // ----------------------------------------------------------

  test('4. ultrawide + "fixed focus" → AMBIGUOUS (anchor di luar candidate span)', () => {
    // Candidates untuk "fixed focus": seg 96 dan seg 102.
    // Anchor "ultrawide" (seg 101) tidak literal ada di seg 96 maupun
    // 102. Candidate 102 berbatasan langsung dengan seg 101 (immediate
    // predecessor) — window backward-1 akan "menemukan" anchor di sana
    // dan salah mengembalikan RESOLVED 102. Resolver harus tetap
    // AMBIGUOUS.
    const result = resolveProvenanceAnchor('fixed focus', 'ultrawide', context);
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.coordinates).toBeNull();
  });

  test('5. selfie + "up to 1080p 30 fps" → AMBIGUOUS (anchor di luar candidate span)', () => {
    // Candidates untuk "up to 1080p 30 fps": seg 97 dan seg 102.
    // Anchor "selfie" (seg 96) tidak literal ada di kedua candidate.
    // Ini kasus elipsis lintas-segmen yang paling jelas: seg 97 adalah
    // lanjutan wacana dari "Ini adalah kamera selfie 13 MP..." (seg 96),
    // tetapi kata "selfie" tidak diulang. Window backward-1 akan
    // salah mengembalikan RESOLVED 97. Resolver harus tetap AMBIGUOUS.
    const result = resolveProvenanceAnchor('up to 1080p 30 fps', 'selfie', context);
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.coordinates).toBeNull();
  });

  test('6. ultrawide + "up to 1080p 30 fps" → AMBIGUOUS (anchor di luar candidate span)', () => {
    // Candidates untuk "up to 1080p 30 fps": seg 97 dan seg 102.
    // Anchor "ultrawide" (seg 101) tidak literal ada di kedua candidate.
    // Candidate 102 berbatasan langsung dengan seg 101 (immediate
    // predecessor). Window backward-1 akan salah mengembalikan
    // RESOLVED 102. Resolver harus tetap AMBIGUOUS.
    const result = resolveProvenanceAnchor('up to 1080p 30 fps', 'ultrawide', context);
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.coordinates).toBeNull();
  });

  test('7. tanpa anchor sama sekali (subtopic null/undefined) → AMBIGUOUS, TIDAK boleh menebak', () => {
    const result = resolveProvenanceAnchor('bukaan f/2.2', null, context);
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.coordinates).toBeNull();
  });

  test('7b. subtopic = string kosong → diperlakukan sama seperti null (AMBIGUOUS)', () => {
    const result = resolveProvenanceAnchor('bukaan f/2.2', '', context);
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.coordinates).toBeNull();
  });

  test('8. anchor tidak mendukung candidate manapun (subtopic salah/tidak relevan) → AMBIGUOUS', () => {
    // "makro" tidak pernah muncul berdampingan dengan "bukaan f/2.2"
    // di span manapun — anchor tidak mendukung, bukan berarti pilih
    // default candidate pertama.
    const result = resolveProvenanceAnchor('bukaan f/2.2', 'makro', context);
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.coordinates).toBeNull();
  });

  test('9. anchor mendukung LEBIH dari satu candidate span sekaligus → AMBIGUOUS (tidak boleh pilih salah satu secara arbitrer)', () => {
    // Fixture buatan: "selfie" sengaja disebutkan ulang di span kedua
    // supaya anchor tidak diskriminatif -- resolver harus tetap
    // AMBIGUOUS, bukan memilih candidate pertama yang cocok.
    const multiSupportContext: EvidenceContext = {
      chunkIndex: 2,
      chunkSegments: [
        { index: 10, start: '00:00:10,000', end: '00:00:11,000', text: 'Kamera selfie punya bukaan f/2.2 dan warna natural.' },
        { index: 11, start: '00:00:11,000', end: '00:00:12,000', text: 'Catatan reviewer soal selfie: bukaan f/2.2 disebut lagi di sini untuk penekanan.' }
      ],
      chunkText:
        'Kamera selfie punya bukaan f/2.2 dan warna natural. ' +
        'Catatan reviewer soal selfie: bukaan f/2.2 disebut lagi di sini untuk penekanan.'
    };

    const result = resolveProvenanceAnchor('bukaan f/2.2', 'selfie', multiSupportContext);
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.coordinates).toBeNull();
  });

  test('9b. NEGATIVE CONTROL LEBIH BERBAHAYA (audit poin 3/4/5): anchor generik yang literal muncul di KEDUA candidate span asli → AMBIGUOUS, membuktikan resolver tidak memakai chunkText.includes(anchor) sebagai shortcut', () => {
    // Berbeda dari test #8 (anchor "makro" -- tidak relevan sama
    // sekali) dan test #9 (anchor "selfie" di fixture buatan).
    // Di sini anchor "kamera" adalah kata yang LITERAL ada di kedua
    // span ASLI (seg 96: "kamera selfie 13 MP..."; seg 101: "kamera
    // ultrawide 8 MP..."). Ini skenario paling menggoda untuk
    // implementasi shortcut `context.chunkText.includes(anchor)`,
    // karena kalau resolver hanya cek `chunkText` secara global (atau
    // window lebih lebar dari span match itu sendiri), "kamera" akan
    // "ditemukan" tanpa membedakan span mana yang dimaksud -- padahal
    // yang benar: "kamera" mendukung KEDUA span 96 dan 101 sekaligus,
    // jadi cardinality(candidateSupport) = 2, bukan 1.
    //
    // Invariant yang diuji secara langsung:
    //   support(anchor, candidateSpanText)  -- BENAR
    //   support(anchor, context.chunkText)  -- SALAH (akan meloloskan
    //                                          kasus ini secara keliru
    //                                          kalau diimplementasikan
    //                                          begini)
    const result = resolveProvenanceAnchor('bukaan f/2.2', 'kamera', context);
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.coordinates).toBeNull();
  });

  test('10. kasus lama "6 generasi Android" tanpa anchor pembeda → tetap AMBIGUOUS (regresi terlarang)', () => {
    const result = resolveProvenanceAnchor('6 generasi Android', null, ambiguousNoAnchorContext);
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.coordinates).toBeNull();
  });

  // ==========================================================
  // LEVEL 3 — kasus sederhana (bukan multi-occurrence sama sekali)
  // harus tetap RESOLVED seperti perilaku existing, resolver
  // tidak boleh meregresi jalur single-match.
  // ==========================================================

  test('11. single occurrence (tanpa ambiguitas) tetap RESOLVED terlepas dari anchor ada/tidak', () => {
    const singleMatchContext: EvidenceContext = {
      chunkIndex: 0,
      chunkSegments: [
        { index: 1, start: '00:00:01,000', end: '00:00:02,000', text: 'Baterai 5000 mAh' }
      ],
      chunkText: 'Baterai 5000 mAh'
    };
    const resultNoAnchor = resolveProvenanceAnchor('Baterai 5000 mAh', null, singleMatchContext);
    expect(resultNoAnchor.status).toBe('RESOLVED');
    expect(resultNoAnchor.coordinates?.segment_start_index).toBe(1);
  });
});

// ============================================================
// CONTRACT TEST — GroundingValidator SETELAH redesign
// ============================================================
// Mengunci bagian kontrak yang lain: Grounding TIDAK LAGI menilai
// ambiguitas sama sekali, murni existence check. Test ini akan
// GAGAL terhadap implementasi grounding.ts SAAT INI (yang masih
// mengembalikan SUSPECT untuk multiple match) -- itu tujuannya:
// menandai baris mana di grounding.ts yang harus diubah di Stage 5.
//
// Baseline saat Stage 3: 1 PASS + 1 FAIL (expected — Stage 5 belum).
// ============================================================

describe('CONTRACT — GroundingValidator pasca-redesign (existence-only)', () => {
  test('multiple occurrence TIDAK LAGI dianggap SUSPECT di layer Grounding — harus PASS', async () => {
    const { GroundingValidator } = await import('../grounding');
    const result = GroundingValidator.validate('bukaan f/2.2', context);
    // KONTRAK BARU: keberadaan >1 match bukan urusan Grounding.
    expect(result.status).toBe('PASS');
  });

  test('0 occurrence tetap FAIL (tidak berubah)', async () => {
    const { GroundingValidator } = await import('../grounding');
    const result = GroundingValidator.validate('kalimat yang tidak ada di chunk', context);
    expect(result.status).toBe('FAIL');
  });
});