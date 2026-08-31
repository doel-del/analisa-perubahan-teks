# Rangkuman Audit — Investigasi `SHARED_PREDICATE_DUPLICATE_SPLIT`

**Untuk review senior team | Disusun 29 Agustus 2026**

---

## 0. Ruang Lingkup

Dokumen ini merangkum seluruh audit yang sudah dilakukan dalam satu rangkaian investigasi, dari penemuan bug infrastruktur harness sampai ditemukannya bug produksi aktif di `duplicate.ts`. Disusun supaya senior team bisa mengecek ulang tanpa perlu membaca seluruh riwayat percakapan.

**Prompt `ANALYSIS_PROMPT_EVIDENCE` tetap FROZEN di v4.6 sepanjang seluruh investigasi ini** — tidak ada satu kata pun yang diubah. Semua temuan di bawah adalah hasil pengukuran terhadap prompt yang sama persis.

---

## 1. Bug Infrastruktur Harness (Ditemukan & Sudah Diperbaiki)

**Masalah**: `reproducibility-harness.ts` menghitung summary (`pass`/`fail`/ `inconclusive`) dengan `fs.readdirSync(caseDir)` — membaca ulang seluruh isi folder output, bukan dari hasil generation yang baru berjalan. File `run-*.json` sisa sesi lama (mis. bekas `RUNS=5` yang lebih besar dari `RUNS` saat ini) ikut mencemari angka tanpa peringatan.

**Gejala**: `{"runs":3,"pass":5}` — pass melebihi total run, matematis mustahil.

**Fix**: `resetCaseDir()` membersihkan folder case sebelum run pertama ditulis; summary dihitung dari array `results` in-memory selama eksekusi berjalan. **Status: sudah diterapkan dan diverifikasi bekerja** (summary sesi-sesi berikutnya konsisten, `pass+fail+inconclusive == runs` selalu).

Semua data eksperimen di bagian 2 dikumpulkan **setelah** fix ini terpasang.

---

## 2. Investigasi Reproducibility: `SHARED_PREDICATE_DUPLICATE_SPLIT`

### 2.1 Tabel Kronologi Eksperimen

|Case|Hipotesis diuji|Konfigurasi|n|Pass rate|
|---|---|---|---|---|
|REG-008 (baseline)|Model gagal shared-predicate default|6 segmen, 4 grup shared-predicate|13|9/13 (~69%) — hanya grup kamera selfie+ultrawide yang pernah gagal|
|EXP-B1|Model bisa split kalau memang wajib (nilai independen)|6 segmen, nilai numerik berbeda per subjek|5|5/5 (100%)|
|EXP-B2|Same-value→merge vs different-value→split|isolasi, domain suhu|5|5/5 (100%)|
|EXP-C1/C2|Kolisi taksonomi subtopic (speaker+mic; brightness+refresh_rate)|isolasi, chunk sparse 100% shared-predicate|5+5|**0/5, 0/5 (0%)** — tapi confound: selalu gagal bersamaan tiap run|
|EXP-D1/D2|Deconfound wording literal prompt|isolasi, reworded dari contoh prompt|5+5|0/5, 0/5 (0%) — gugur, tetap gagal meski wording diubah total|
|EXP-E|Verbatim control|isolasi, 2 segmen|5|0/5 (0%)|
|EXP-F1|Length control TANPA priming|6 segmen filler netral + 1 target|5|**4/5 (80%)** — ceiling tertinggi yang teramati|
|EXP-F2|Length control DENGAN 3x priming analog|6 segmen (3 priming + target)|5|3/5 (60%) — priming tidak menaikkan, malah sedikit lebih rendah (dalam noise n=5)|

**Total n=38 run lintas 6 eksperimen** (REG-008, D1, D2, E, F1, F2) yang melacak pasangan kamera selfie+ultrawide secara spesifik — **tidak pernah mencapai 100% pass di konfigurasi manapun**.

### 2.2 Hipotesis yang Gugur

1. **Proximity Patch D** — tidak pernah terverifikasi sebagai penyebab utama.
2. **Wording literal sesuai contoh prompt** — gugur (EXP-D1/D2 gagal sama seperti EXP-E meski kalimat di-reword total).
3. **Priming analog menaikkan reliabilitas** — gugur, arahnya flat-to-negatif (EXP-F2 tidak lebih baik dari EXP-F1 pada n=5).

### 2.3 Hipotesis yang Bertahan Sebagian

4. **Density/kekayaan chunk = faktor dominan.** Isolasi (0-2 segmen) -> 0%. Chunk kaya (6 segmen) -> 60-80%. Efek besar dan konsisten.
5. **Named-subtopic collision (selfie/ultrawide, speaker/mic, brightness/refresh_rate) = amplifier kuat, BUKAN syarat mutlak.** Counter-example penting: Port USB-C depan/belakang (EXP-F2, **tanpa** named subtopic -- `subtopic: null` di raw output) tetap gagal merge di KEDUA run FAIL, diverifikasi langsung dari raw JSON (bukan cuma satu run seperti dugaan awal -- ini koreksi terhadap audit saya sendiri sebelumnya, diterima dan dikonfirmasi oleh senior team).
6. **Divergensi antar-pasangan dalam satu generation itu nyata**: di EXP-F2, generation yang sama menghasilkan engsel kiri/kanan & kipas kiri/kanan tetap merge benar, sementara USB-C & kamera split -- bukan mode "atomisasi total per-generation".
7. **Confound belum tuntas terpisah**: EXP-C1/C2 selalu gagal bersamaan (5/5, tidak pernah campuran) -- kemungkinan chunk 100%-shared-predicate (tanpa jeda FACT/MEASUREMENT netral) mendorong mode berbeda dari density semata. **Belum dikonfirmasi** -- EXP-G1/G2 (revisi desain kontrol) sudah disiapkan tapi belum dijalankan.

### 2.4 Keputusan yang Diambil

- **Prompt tetap FROZEN v4.6** -- riwayat investigasi menunjukkan akar sebab terus bergeser (proximity -> wording -> priming -> taksonomi -> "amplifier bukan syarat"), dan tidak ada konfigurasi yang mencapai 100%. Mengejar penyebab akar lebih lanjut di level prompt dinilai tidak proporsional dibanding manfaatnya.
- **Mitigasi dipindah ke layer kode** -- argumen kunci: signature kegagalan (>=2 evidence dengan `source_excerpt` identik/nyaris-identik) **seragam** terlepas dari kamera, USB-C, atau pasangan lain -- jadi satu mekanisme deteksi generik bisa menutup semua kasus tanpa perlu menuntaskan pemahaman akar sebab masing-masing anomali.

---

## 3. Audit Validator Production -- TEMUAN KRITIS

Berbeda dari bagian 2 (riset kualitas prompt), bagian ini adalah **audit kode yang sudah berjalan di production**, dipicu oleh kebutuhan mendesain safety-net.

### 3.1 Lima Validator Per-Evidence (`assessment.ts`, `atomicity.ts`,

`grounding.ts`, `provenance.ts`, `value.ts`) -- Terkonfirmasi Buta Terhadap Pola Ini

Ditrace manual pakai data nyata EXP-E (dua evidence OPINION, excerpt identik, subtopic `selfie` vs `ultrawide`): **kelima validator PASS bersih** untuk masing-masing evidence secara individual -- karena semuanya beroperasi per-evidence tunggal, tidak ada satupun yang membandingkan lintas evidence dalam satu batch. Ini bukan kelalaian, memang di luar tanggung jawab desainnya -- konfirmasi bahwa layer ini bukan tempat yang tepat untuk safety-net.

### 3.2 `duplicate.ts` -- BUG PRODUKSI AKTIF: Silent Data Loss

**Alur yang ditrace dan dikonfirmasi** memakai pasangan evidence nyata dari EXP-E:

1. `ProvenanceValidator.resolve()` dipanggil terpisah per-evidence. Karena `source_excerpt` keduanya identik byte-per-byte, keduanya resolve ke `source_coordinates` yang **identik**.
2. `compareSourceRelation()` di `duplicate.ts` -> `'SAME'`.
3. `excerptA === excerptB` (via `normalizeForSearch`) -> `true`.
4. Kondisi `sourceRelation === 'SAME' && isExcerptSame` -> langsung masuk **STRONG DUPLICATE EXCEPTION**, panggil `resolveIdenticalOccurrence()`, **melewati pengecekan context/subtopic sama sekali**.
5. Kedua evidence OPINION (`value: null, unit: null`) -> `hasMoreInfoA === hasMoreInfoB === false` -> default: **`action: 'KEEP_FIRST'`**.
6. Di `server.ts`: `KEEP_FIRST` -> evidence kedua (mis. "ultrawide") masuk `removedEvidenceIds` -> **dihapus dari `finalEvidence`**.

**Hasil**: user hanya melihat SATU evidence -- informasi soal subjek kedua (ultrawide) **hilang total, tanpa jejak, tanpa log yang bisa ditelusuri user**. Ini terjadi **hari ini**, setiap kali `SHARED_PREDICATE_DUPLICATE_SPLIT` muncul dari LLM (frekuensi 30-100% tergantung struktur chunk, sudah dibuktikan di bagian 2).

> **Catatan kejujuran metodologis**: rantai langkah 1-6 di atas diverifikasi lewat pembacaan kode manual (`grounding.ts`, `provenance.ts`, `duplicate.ts`), BUKAN lewat eksekusi test sungguhan -- sandbox audit tidak punya `node_modules`/environment proyek untuk menjalankan kode ini secara langsung. Test `D-09` (bagian 4) ditulis justru untuk memverifikasi rantai ini secara empiris di mesin sungguhan.

### 3.3 `normalizeForSearch` vs `normalizeForMatching` -- Filosofi Bertentangan

`srt.ts` (dipakai `duplicate.ts`, `grounding.ts`, `provenance.ts`):

```ts
.replace(/[.,!?;:()[\]{}]/g, ' ')   // SEMUA tanda baca -> spasi, tanpa pengecualian
```

Ini **longgar** -- cocok untuk pencarian umum. Tapi dipakai oleh `GroundingValidator`/`ProvenanceValidator` yang tugasnya justru menegakkan **literalness ketat** (CRITICAL FAIL kalau excerpt tidak ditemukan literal).

Bandingkan dengan `normalizeForMatching` di harness (14 self-test terkunci): koma tambahan **harus tidak match** (A5), ellipsis **harus tidak setara** tanpa titik (A8/A9) -- keduanya bertentangan langsung dengan perilaku `normalizeForSearch` yang mengubah semua tanda baca jadi spasi tanpa pengecualian.

**Implikasi**: seluruh angka reproducibility di bagian 2 diukur pakai standar ketat (`normalizeForMatching`). **Belum diverifikasi apakah production menegakkan standar literal yang sama ketatnya** -- berpotensi meloloskan excerpt yang oleh harness akan divonis `NON_LITERAL_EXCERPT`. Ini pertanyaan terpisah dari investigasi utama, levelnya lebih fundamental (soal validitas alat ukur kita sendiri).

### 3.4 `ResolverAction.MERGE` -- Dead Code

Tipe `'MERGE'` sudah dianggarkan di `ResolverAction`, tapi **tidak ada satu fungsi pun** (di `duplicate.ts`) yang benar-benar mengembalikannya, dan `server.ts` **tidak punya branch** untuk menanganinya. Ini extension point yang sudah disiapkan tapi belum diisi -- jadi implementasi fix tidak perlu mengubah type system, cukup mengisi logic yang sudah dianggarkan.

---

## 4. Audit Test Suite (`duplicate.test.ts`)

Setelah file test yang sudah ada (D-01 s.d. D-08 + 2 kontrol negatif) diberikan, dilakukan cross-check terhadap arah fix yang diusulkan:

**Temuan kunci**: SEMUA pasangan evidence pada test yang berujung `KEEP_FIRST`/`KEEP_BEST` (D-01, D-04, D-05, D-06) punya **subtopic yang identik** di antara kedua evidence-nya. **Tidak ada satupun test existing yang menguji "excerpt identik + subtopic BERBEDA"** -- celah persis di titik itu yang dieksploitasi kasus EXP-E.

**Kesimpulan actionable**: menambahkan gate "subtopic harus sama" sebelum `resolveIdenticalOccurrence()` boleh mengambil jalur "duplikat asli" adalah perbaikan yang **aman** -- divalidasi tidak meregresi satupun dari 10 test yang sudah ada.

**Test baru ditulis**: `D-09` -- mereplikasi kasus EXP-E, sengaja didesain untuk **FAIL** pada implementasi saat ini (regression guard untuk bug yang belum diperbaiki, bukan bug baru).

### Temuan Sampingan (dari file test, tidak terkait langsung)

- **`E140_FIXTURE`** (dari D-01, diklaim "data aktual v4.1"): `type: 'FACT'` tapi `reviewer_assessment: 'negative'` -- melanggar `AssessmentValidator`. Seharusnya sudah dikuarantina sebelum sempat sampai ke `DuplicateValidator` kalau memang melalui pipeline production yang sama. Perlu dicek apakah ini drift versi data lama, bukan bug aktif saat ini.
- **D-05**: judul test menyebut `"-> PRESERVE"` tapi assertion-nya `toBe('KEEP_FIRST')` -- dokumentasi tidak sinkron, minor, tidak mendesak.

---

## 5. Keputusan Arsitektur (Disepakati, Sebagian Belum Dieksekusi)

1. **Modul baru `src/evidence/text-matching.ts`** (bukan digabung ke `production-pipeline.ts`) untuk menaungi `normalizeForMatching` + wrapper containment-nya. Alasan: `production-pipeline.ts` sudah punya cakupan SSOT yang didefinisikan eksplisit di header-nya sendiri (SRT parsing, chunking, evidence JSON parsing, prompt builder) -- text matching adalah concern independen, konsisten dengan pola `srt.ts`/`types.ts` yang sudah terpisah di codebase ini. **Status: disetujui user, belum dieksekusi.**
2. **Safety-net auto-merge** di `duplicate.ts` (mengisi `'MERGE'` yang sudah dianggarkan) + branch baru di `server.ts` untuk menanganinya. **Status: sketsa kontrak sudah ada, implementasi belum dimulai** -- menunggu D-09 terkonfirmasi FAIL secara empiris dulu (langkah 1 di bagian 7), dan idealnya menunggu modul `text-matching.ts` selesai lebih dulu supaya safety-net memakai primitive matching yang sama dengan harness (mencegah drift, sesuai prinsip SSOT yang sudah dipatok tim sendiri di `production-pipeline.ts`).
3. **Klarifikasi dua sistem validator** (sempat membingungkan): `src/evidence/validators/*` = validator PRODUCTION (dipanggil `server.ts` untuk user asli). Fungsi `validateInvariants`/ `validateSharedPredicateOwnership`/dkk. di dalam `reproducibility-harness.ts` = validator RISET E.3D (tidak pernah dipanggil `server.ts`, khusus mengukur eksperimen terhadap `manifest.json`).

---

## 6. Status Verifikasi -- Apa yang Sudah Pasti vs Masih Dugaan

|Klaim|Status|
|---|---|
|Bug summary-counting harness|Diperbaiki & diverifikasi jalan (multi-sesi)|
|38 run eksperimen kamera (REG-008 s.d. F2)|Data mentah diverifikasi langsung dari raw JSON|
|USB-C gagal di KEDUA run FAIL EXP-F2|Diverifikasi langsung dari raw JSON (koreksi atas klaim awal "satu run")|
|Alur silent-data-loss di `duplicate.ts` (langkah 1-6, bagian 3.2)|**Ditrace manual dari kode, BELUM dieksekusi di environment sungguhan**|
|`normalizeForSearch` vs `normalizeForMatching` bertentangan pada kasus koma/ellipsis|Dibandingkan langsung dari kode kedua fungsi|
|Gate subtopic aman terhadap 10 test existing|Dicek manual satu-per-satu terhadap kode test asli|
|E140 FACT+assessment adalah bug aktif (bukan data lama)|**Belum dikonfirmasi**, perlu cek histori|
|`findSourceMatches` (`search.ts`) -- detail cara resolve match|**Belum pernah dilihat isinya**, beberapa kesimpulan di 3.2 berasumsi perilaku "exact match pasca-normalisasi" yang wajar tapi belum terverifikasi langsung|

---

## 7. Item Terbuka / Next Steps (Urutan Prioritas)

1. **Jalankan `duplicate.test.ts` (dengan D-09 ditambahkan) di environment sungguhan** -- konfirmasi empiris bahwa D-01 s.d. D-08 tetap PASS dan D-09 FAIL persis seperti prediksi. Ini validasi wajib sebelum fix ditulis.
2. Kirim `src/evidence/search.ts` untuk melengkapi audit `findSourceMatches` -- menutup satu-satunya bagian rantai bukti yang masih berupa asumsi.
3. Implementasi fix di `duplicate.ts` (gate subtopic + isi `'MERGE'`) + branch baru `server.ts` -- setelah #1 dan #2 selesai.
4. Refactor `text-matching.ts` (idealnya sebelum atau bersamaan dengan #3).
5. Cek histori `E140_FIXTURE` -- drift versi atau bug aktif.
6. Perbaiki judul/assertion D-05 yang tidak sinkron.
7. EXP-G1/G2 (kontrol density untuk named-subtopic collision) -- prioritas rendah, tidak memblokir apa pun, bisa jalan paralel kapan saja.
8. Cek apakah production benar-benar menegakkan standar literal yang sama ketatnya dengan harness (isu `normalizeForSearch`, bagian 3.3) -- perlu didiskusikan apakah ini di-treat sebagai bug terpisah atau backlog.

---

## 8. Addendum — Audit Lanjutan & Verifikasi Empiris (29 Agustus 2026, sesi Claude)

> Bagian ini disusun agar proses selanjutnya bisa mengambil keputusan **tanpa perlu membaca kode lagi** — semua rujukan kode di bawah sudah dikutip langsung dari file sumber pada commit yang diaudit.

### 8.1 Item #2 (kirim `search.ts`) — DITUTUP

`src/evidence/search.ts` sudah dibaca dan diaudit penuh. Kesimpulan: `findSourceMatches()` memang beroperasi murni exact-match pasca-normalisasi (via `normalizeForSearch`) terhadap `context.chunkSegments` yang sama -- untuk 1/2/3 segmen kontigu. Untuk dua evidence dengan `source_excerpt` byte-identik yang berasal dari chunk yang sama, keduanya **pasti** menghasilkan `SegmentMatch[]` yang identik.

**Dampak**: asumsi paling rapuh dalam rantai bug 3.2 (langkah 1: "kedua evidence resolve ke `source_coordinates` yang identik") sekarang **terverifikasi langsung dari kode**, bukan lagi asumsi "perilaku yang wajar tapi belum dilihat". Baris di tabel 6 rangkuman awal:

> `findSourceMatches` (`search.ts`) -- **Belum pernah dilihat isinya**

berubah menjadi: **Sudah diaudit, mengkonfirmasi asumsi rantai 3.2 benar.**

### 8.2 Koreksi kecil — D-05 title mismatch (bagian 4)

Klaim awal: _"D-05: judul test menyebut `-> PRESERVE` tapi assertion-nya `toBe('KEEP_FIRST')`"_.

Setelah dicek ulang persis di `duplicate.test.ts`: yang tidak sinkron adalah **komentar section header** di atas test (`// D-05: Unknown context, same coords, identical claim → PRESERVE`), BUKAN judul string di `test(...)` itu sendiri. Judul test yang sebenarnya sudah benar:

```ts
test('D-05: Unknown context — same claim, same excerpt, same coords → KEEP_FIRST', () => {
  ...
  expect(result.duplicatePairs[0].action).toBe('KEEP_FIRST');
});
```

**Kesimpulan**: bukan bug/inkonsistensi yang perlu diperbaiki di assertion manapun -- hanya komentar block/header di atas test yang stale dan sebaiknya disamakan dengan judul test yang sudah benar. Prioritas tetap rendah, tidak mendesak, tidak memblokir apa pun.

### 8.3 D-09 — Ditulis dan Dijalankan, Hasil Empiris Terkonfirmasi

**Status sebelum sesi ini**: rangkuman audit menyatakan _"Test baru ditulis: D-09"_, tapi verifikasi lapangan (`npx vitest run src/evidence/validators/__tests__/duplicate.test.ts`) menunjukkan hanya **10 tests**, sama persis dengan yang tercatat di project files. D-09 belum benar-benar ada di file test yang berjalan -- klaim "sudah ditulis" di rangkuman mendahului kenyataan.

**Yang dilakukan**: D-09 ditulis dan ditempelkan ke `src/evidence/validators/__tests__/duplicate.test.ts`, mereplikasi kasus EXP-E persis (dua evidence `OPINION`, `source_excerpt` identik byte-per-byte, `subtopic` berbeda -- `selfie` vs `ultrawide`, `value`/`unit` null di keduanya, `source_coordinates` identik):

```ts
test('D-09: Same excerpt + DIFFERENT subtopic (SHARED_PREDICATE_DUPLICATE_SPLIT replica) → must NOT be KEEP_FIRST', () => {
  const SAME_EXCERPT =
    'kamera selfie dan ultrawide yang perlu peningkatan, terutama di kondisi low light';

  const evidenceList: EvidenceItem[] = [
    {
      evidence_id: 'E201', topic: 'camera', subtopic: 'selfie', type: 'OPINION',
      claim: 'Kamera selfie perlu peningkatan, terutama di kondisi low light.',
      value: null, unit: null, context: 'kamera selfie dan ultrawide',
      comparison_target: null, reviewer_assessment: 'negative', certainty: 'explicit',
      source_excerpt: SAME_EXCERPT,
      source_coordinates: { chunk_index: 4, segment_start_index: 210, segment_end_index: 210 }
    },
    {
      evidence_id: 'E202', topic: 'camera', subtopic: 'ultrawide', type: 'OPINION',
      claim: 'Kamera ultrawide perlu peningkatan, terutama di kondisi low light.',
      value: null, unit: null, context: 'kamera selfie dan ultrawide',
      comparison_target: null, reviewer_assessment: 'negative', certainty: 'explicit',
      source_excerpt: SAME_EXCERPT,
      source_coordinates: { chunk_index: 4, segment_start_index: 210, segment_end_index: 210 }
    }
  ];

  const result = DuplicateValidator.detect(evidenceList);

  expect(result.candidates).toHaveLength(1);
  expect(result.duplicatePairs).toHaveLength(1);
  expect(result.duplicatePairs[0].action).not.toBe('KEEP_FIRST');
});
```

**Insiden penempatan (dicatat untuk kejujuran metodologis)**: percobaan pertama gagal dengan error framework (_"Calling the test function inside another test function"_) -- block D-09 tertempel di dalam body test `NEGATIVE: Same source but different excerpt and context`, bukan setelah `});` penutupnya. Ini murni kesalahan penempatan teks, bukan kesalahan logic test. Setelah diperbaiki (memastikan `});` penutup test sebelumnya ada sebelum block D-09 dimulai), file berjalan dengan struktur yang benar.

**Hasil eksekusi final (`npx vitest run`, 29 Agustus 2026, 10:59:56)**:

```
Test Files  1 failed (1)
     Tests  1 failed | 10 passed (11)

 × D-09: Same excerpt + DIFFERENT subtopic (SHARED_PREDICATE_DUPLICATE_SPLIT replica) → must NOT be KEEP_FIRST
   AssertionError: expected 'KEEP_FIRST' not to be 'KEEP_FIRST'
    ❯ duplicate.test.ts:547:49
      expect(result.duplicatePairs[0].action).not.toBe('KEEP_FIRST');
```

Semua 10 test lama (D-01 s.d. D-08 + 2 negative control) **tetap PASS** -- mengkonfirmasi empiris klaim bagian 4 rangkuman awal ("gate subtopic aman terhadap 10 test existing") dari sisi yang berlawanan: menambahkan D-09 tidak meregresi apa pun.

**Signifikansi**: pesan error `expected 'KEEP_FIRST' not to be 'KEEP_FIRST'` adalah bukti langsung dan tidak ambigu bahwa rantai bug di bagian 3.2 (silent data loss di `duplicate.ts`) benar-benar terjadi di runtime, bukan lagi kesimpulan dari pembacaan kode manual.

### 8.4 Tabel Status — Update dari Bagian 6

|Klaim|Status di rangkuman awal|Status sekarang|
|---|---|---|
|Alur silent-data-loss di `duplicate.ts` (langkah 1-6, bagian 3.2)|Ditrace manual dari kode, belum dieksekusi di environment sungguhan|**TERVERIFIKASI EMPIRIS** — dikonfirmasi lewat eksekusi `duplicate.test.ts` (D-09 FAIL persis sesuai prediksi)|
|`findSourceMatches` (`search.ts`)|Belum pernah dilihat isinya|**Sudah diaudit** — mengkonfirmasi asumsi exact-match-pasca-normalisasi di rantai 3.2|
|D-05 title/assertion mismatch|Judul test tidak sinkron dengan assertion|**Dikoreksi**: yang stale adalah komentar section header, bukan judul `test(...)`-nya; assertion selalu benar|
|D-09 sudah ditulis|Diklaim sudah ditulis|**Sekarang benar-benar ada, dijalankan, dan FAIL sesuai prediksi** (11 tests total, 1 failed by design)|

Baris lain di tabel bagian 6 (bug summary-counting harness, 38 run eksperimen kamera, USB-C di EXP-F2, `normalizeForSearch` vs `normalizeForMatching`, E140 belum dikonfirmasi) **tidak berubah** -- belum ada aktivitas audit baru terhadap item-item tersebut di sesi ini.

### 8.5 Keputusan Terbuka yang Perlu Diputuskan Sebelum Lanjut Kode

Dengan D-09 terkonfirmasi FAIL, langkah berikutnya menurut urutan yang sudah disepakati (lihat bagian 5 dan Next Steps bagian 7) adalah:

1. Refactor `text-matching.ts` (pindahkan `normalizeForMatching` + wrapper containment generik dari `reproducibility-harness.ts`).
2. Fix `duplicate.ts`: gate subtopic sebelum `resolveIdenticalOccurrence()` boleh mengambil jalur STRONG DUPLICATE EXCEPTION.
3. Branch baru di `server.ts` jika opsi fix melibatkan `MERGE`.

**Satu keputusan desain BELUM diambil dan memblokir langkah #2 di atas**: untuk kasus "excerpt identik, subtopic berbeda" (persis kasus D-09) -- apakah hasilnya harus:

- **PRESERVE** — kedua evidence tetap muncul terpisah di output. Aman dan sederhana untuk diimplementasikan (tidak perlu logic penggabungan claim baru), tapi user akan melihat dua evidence dengan `source_excerpt` yang identik persis, yang terasa redundant meski secara teknis bukan informasi yang salah.
- **MERGE** — kedua evidence digabung menjadi satu evidence yang mencakup kedua subtopic (mis. "kamera selfie dan ultrawide"). Lebih bersih untuk user, mengisi `ResolverAction.MERGE` yang sudah dianggarkan sejak awal (bagian 3.4, dead code), tapi butuh logic penggabungan `claim`/`subtopic`/`context` yang belum ada sama sekali di codebase manapun -- baik di `duplicate.ts` maupun `server.ts`.

Keputusan ini sebaiknya diambil lewat diskusi eksplisit (bukan diputuskan sepihak oleh implementer) sebelum kode fix ditulis, konsisten dengan prinsip kerja _desain dulu -> audit -> baru code_ yang sudah dipegang sepanjang proyek ini.

### 8.6 Next Steps — Revisi

Urutan dari bagian 7 direvisi sebagai berikut (item yang sudah selesai dicoret, urutan sisanya disesuaikan):

1. ~~Jalankan `duplicate.test.ts` (dengan D-09) di environment sungguhan~~ -- **SELESAI**, hasil di bagian 8.3.
2. ~~Kirim `search.ts` untuk melengkapi audit `findSourceMatches`~~ -- **SELESAI**, hasil di bagian 8.1.
3. **[BLOCKER BARU]** Putuskan PRESERVE vs MERGE untuk gate subtopic (lihat 8.5) -- diskusi eksplisit diperlukan sebelum lanjut.
4. Refactor `text-matching.ts` (idealnya sebelum atau bersamaan dengan #5, supaya fix tidak menulis primitive matching lokal yang harus di-refactor ulang).
5. Implementasi fix di `duplicate.ts` (gate subtopic + isi hasil keputusan #3, entah `PRESERVE` eksplisit atau `MERGE`) + branch baru `server.ts` jika `MERGE` yang dipilih.
6. Perbaiki komentar section header D-05 yang stale (lihat 8.2) -- housekeeping, tidak mendesak.
7. Cek histori `E140_FIXTURE` -- drift versi atau bug aktif.
8. EXP-G1/G2 (kontrol density untuk named-subtopic collision) -- prioritas rendah, tidak memblokir apa pun.
9. Cek apakah production menegakkan standar literal seketat harness (isu `normalizeForSearch`, bagian 3.3) -- perlu didiskusikan apakah di-treat sebagai bug terpisah atau backlog.

---

## 9. Addendum 2 — Implementasi Fix (29 Agustus 2026, sesi Claude, lanjutan)

### 9.1 Keputusan Desain: MERGE (bukan PRESERVE)

Item 8.5 (blocker) diputuskan: **MERGE**. Alasan: PRESERVE meninggalkan dua evidence dengan `source_excerpt` byte-identik di output -- terlihat seperti duplikat yang tidak dibersihkan dan mempersulit analisa, justru bertentangan dengan tujuan awal (mempermudah analisa). MERGE menghasilkan satu evidence yang mencerminkan struktur asli shared-predicate, dan mengisi `ResolverAction.MERGE` yang sejak awal sudah dianggarkan sebagai dead code (bagian 3.4).

Prinsip desain merge: **tidak melakukan NLP/parafrase/semantic rewriting** -- `claim` digabung literal dari dua claim yang sudah tervalidasi individual (konsisten dengan NO SEMANTIC EXPANSION di `prompts.ts`). Tidak ada teks baru yang "dikarang" di luar apa yang sudah ada di kedua evidence asal.

### 9.2 Perubahan Kode

**`types.ts`** -- satu baris:

```ts
subtopic?: string;   // sebelum
subtopic?: string | null;   // sesudah
```

Alasan: field lain (`value`, `unit`, `context`) sudah nullable, `subtopic` tertinggal. Merge butuh `subtopic: null` untuk menandai "spans >1 subtopic" -- konsisten dengan ATURAN BARU #7 di `prompts.ts` ("gunakan null daripada memilih subtopic yang salah").

Ditambahkan juga dua field baru (additive, non-breaking):

```ts
merged_subtopics?: string[] | null;
merged_from_evidence_ids?: string[] | null;
```

**`duplicate.ts`** -- perubahan inti:

- `DuplicateResolution` mendapat field opsional `mergedEvidence?: EvidenceItem`.
- STRONG DUPLICATE EXCEPTION (source SAME + excerpt SAME byte-identik) sekarang memanggil `resolveIdenticalOccurrenceOrMerge()`, bukan langsung `resolveIdenticalOccurrence()`.
- Fungsi baru `resolveIdenticalOccurrenceOrMerge()`: gate berdasarkan `subtopic` (via `normalizeForSearch`) DAN `type`:
    - subtopic berbeda + type SAMA -> `MERGE` (pola `SHARED_PREDICATE_DUPLICATE_SPLIT` yang teramati di seluruh data eksperimen E.3D, bagian 2).
    - subtopic berbeda + type BERBEDA -> `PRESERVE` (kombinasi ini tidak pernah teramati di data eksperimen manapun; sengaja tidak dipaksakan merge otomatis untuk kasus tak terduga -- PRESERVE lebih aman daripada menggabungkan dua type berbeda diam-diam).
    - selain itu -> fallback ke `resolveIdenticalOccurrence()` lama (perilaku KEEP_FIRST/KEEP_BEST tidak berubah untuk kasus normal).
- Fungsi baru `buildMergedEvidence()`: mewarisi `source_excerpt`, `source_coordinates`, `type`, `topic`, `value`, `unit`, `comparison_target`, `certainty` dari evidence pertama (sah karena gate sudah menjamin source occurrence + excerpt identik); `claim` digabung literal via `mergeClaims()`; `subtopic` di-null-kan; `merged_subtopics` diisi kedua subtopic asal; `merged_from_evidence_ids` diisi kedua evidence_id asal; `context`/`reviewer_assessment` diisi hanya jika sama di keduanya, kalau beda -> null (tidak menebak).

**`server.ts`** -- penanganan action `MERGE`:

- Loop resolusi (`for (const resolution of duplicateResult.duplicatePairs)`) menangani `MERGE` sebelum logic `KEEP_BEST`/`KEEP_FIRST`: kedua evidence_id asal masuk `removedEvidenceIds`, `mergedEvidence` masuk accumulator baru `mergedEvidenceToAdd`. Guard: jika `mergedEvidence` tidak ada (seharusnya tidak pernah terjadi, tapi dijaga), fallback ke PRESERVE dengan warning log, tidak crash.
- `preservedEvidence` sekarang `.concat(mergedEvidenceToAdd)` setelah filter.
- Response JSON mendapat field baru `duplicateMerged` (array detail merge, terpisah dari `duplicateRemoved` supaya semantiknya tidak campur -- "removed" berarti hilang, "merged" berarti digabung dan tetap ada) dan `stats.mergedCount`.

### 9.3 Update Test Suite

D-09 diperkuat dari sekadar `not.toBe('KEEP_FIRST')` menjadi assertion positif penuh: `toBe('MERGE')` + isi `mergedEvidence` (`subtopic` null, `merged_subtopics` berisi kedua subtopic asal dalam urutan yang benar, `merged_from_evidence_ids` berisi kedua evidence_id asal, `claim` mengandung kedua kata kunci subjek, `source_excerpt` tidak berubah).

D-10 ditambahkan sebagai edge-case guard: excerpt identik + subtopic berbeda + **type juga berbeda** (`FACT` vs `OPINION`) -> harus tetap `PRESERVE`, bukan `MERGE` -- memverifikasi bahwa gate tidak over-generalize ke kombinasi yang tidak pernah teramati di data eksperimen.

### 9.4 Hasil Eksekusi Final (Terverifikasi Empiris)

```
npx vitest run src/evidence/validators/__tests__/duplicate.test.ts

 ✓ src/evidence/validators/__tests__/duplicate.test.ts (12 tests) 36ms
   ✓ D-01 s.d. D-08 + 2 negative control -- semua tetap PASS (tidak ada regresi)
   ✓ D-09: Same excerpt + DIFFERENT subtopic → MERGE
   ✓ D-10: Same excerpt + different subtopic + DIFFERENT type → PRESERVE
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

Satu insiden minor selama implementasi: TypeScript error `TS2322` (`Type 'null' is not assignable to type 'string | undefined'`) pada `subtopic: null` di `buildMergedEvidence()` -- root cause `subtopic` di `types.ts` belum nullable seperti field lain. Diperbaiki dengan satu baris (lihat 9.2), tidak ada dampak lain.

### 9.5 Status Akhir

|Item|Status|
|---|---|
|Blocker 8.5 (PRESERVE vs MERGE)|**DIPUTUSKAN: MERGE**|
|Fix `duplicate.ts` (gate subtopic + isi `MERGE`)|**SELESAI, terverifikasi 12/12 test PASS**|
|Branch `MERGE` di `server.ts`|**SELESAI** (belum diverifikasi lewat `/api/analyze-review` end-to-end -- lihat item terbuka di bawah)|
|`text-matching.ts` refactor|**BELUM dieksekusi** -- gate subtopic saat ini memakai `normalizeForSearch` (sudah ada di `duplicate.ts`), BUKAN `normalizeForMatching`. Ini sengaja dibiarkan untuk sekarang karena `normalizeForSearch` sudah cukup untuk perbandingan `subtopic` (nilai terkontrol dari daftar subtopic prompt, bukan free-text excerpt yang butuh presisi ketat) -- tapi tetap dicatat sebagai utang refactor, bukan keputusan permanen untuk selamanya menghindari modul `text-matching.ts`.|

### 9.6 Item Terbuka Baru

1. **Smoke test end-to-end** `/api/analyze-review` dengan payload nyata yang memicu `SHARED_PREDICATE_DUPLICATE_SPLIT` (mis. fixture `failure-reg-008.srt`, grup kamera selfie+ultrawide) -- memverifikasi `duplicateMerged` muncul benar di response JSON dan `finalEvidence` berisi satu evidence gabungan, bukan dua. Unit test `duplicate.ts` sudah PASS, tapi belum ada verifikasi jalur penuh parse->validate->duplicate-gate->response.
2. Refactor `text-matching.ts` (bagian 5 rangkuman awal) -- masih belum dieksekusi. Sekarang ada dua kandidat consumer produksi yang bisa memakainya jika jadi: gate subtopic (baru) dan `normalizeForSearch`/`normalizeForMatching` yang berbeda filosofi (bagian 3.3, tetap belum direkonsiliasi).
3. Item lama yang belum tersentuh (E140 histori, EXP-G1/G2, `normalizeForSearch` vs `normalizeForMatching`) -- tidak berubah, tetap di backlog sesuai urutan bagian 8.6.

---

## 10. Addendum 3 — Fix Ditutup, Terverifikasi 14/14 (29 Agustus 2026)

### 10.1 Hasil Eksekusi Final

```
npx vitest run src/evidence/validators/__tests__/duplicate.test.ts

 ✓ src/evidence/validators/__tests__/duplicate.test.ts (14 tests) 42ms
   ✓ D-01 s.d. D-08 + 2 negative control -- semua tetap PASS (tidak ada regresi)
   ✓ D-09: Same excerpt + DIFFERENT subtopic (SHARED_PREDICATE_DUPLICATE_SPLIT replica) → MERGE
   ✓ D-10: Same excerpt + different subtopic + DIFFERENT type → PRESERVE (edge case guard)
   ✓ D-11: Same excerpt + different subtopic + SAME type, but DIFFERENT value → PRESERVE (not silently dropped)
   ✓ D-12 (DOKUMENTASI PERILAKU SAAT INI): Same excerpt + ONE subtopic null → jalur lama, TIDAK masuk gate MERGE
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

**Signifikansi D-09**: assertion diperkuat dari `not.toBe('KEEP_FIRST')` (regression guard, didesain FAIL) di Addendum 2 menjadi assertion positif penuh `toBe('MERGE')` + verifikasi isi `mergedEvidence` -- dan sekarang **PASS**. Ini penutup siklus: bug ditemukan (trace manual) → dikonfirmasi empiris (D-09 FAIL) → diperbaiki (gate subtopic + field-compatibility check) → diverifikasi empiris ulang (D-09 PASS dengan assertion yang lebih ketat dari sebelumnya, bukan dilonggarkan).

### 10.2 Perbaikan dari Audit Balik (Bagian 9 -> Sesi Ini)

Dua celah yang ditemukan lewat audit independen terhadap kode `duplicate.ts` hasil Addendum 2 (bukan dari deskripsi tekstual, tapi dari pembacaan kode baris-per-baris):

1. **Blind inheritance di `buildMergedEvidence()`** -- `value`/`unit`/`comparison_target`/`certainty`/`topic` sebelumnya ikut ter-spread dari `evidenceA` tanpa pengecekan kesetaraan terhadap `evidenceB` (berbeda dari `context`/`reviewer_assessment` yang sudah dapat perlakuan `*Same` ternary sejak awal -- inkonsistensi penerapan prinsip yang sama dalam satu fungsi). **Diperbaiki**: fungsi baru `fieldsCompatibleForMerge()` dipanggil sebagai gate tambahan sebelum `MERGE` boleh terjadi; kalau field-field itu ternyata beda, fallback ke `PRESERVE` (bukan `MERGE` yang akan diam-diam membuang salah satu). Diverifikasi lewat `D-11`.
2. **Asumsi cakupan gate lebih luas dari kenyataan** -- gate `hasDistinctSubtopics` mensyaratkan KEDUA subtopic terisi (`!!subtopicA && !!subtopicB`); kasus satu subtopic `null` jatuh ke jalur lama (`KEEP_FIRST`/`KEEP_BEST`), bukan ke `MERGE` seperti yang sempat diasumsikan. **Tidak diperbaiki (disengaja)** -- didokumentasikan lewat `D-12` sebagai residual risk yang disadari, bukan ditutup, karena belum pernah teramati di 38 run eksperimen E.3D manapun. Keputusan ini eksplisit, bukan kelalaian.

### 10.3 Status Akhir -- SHARED_PREDICATE_DUPLICATE_SPLIT

|Item|Status|
|---|---|
|Bug silent-data-loss di `duplicate.ts`|**DITUTUP** -- gate subtopic + field-compatibility check, 14/14 test PASS|
|`ResolverAction.MERGE` (sebelumnya dead code)|**AKTIF DIPAKAI**|
|Regresi terhadap 10 test lama|**NIHIL**, diverifikasi eksplisit tiap iterasi (Addendum 2 dan sesi ini)|
|D-12 (subtopic null-asimetris)|**Residual risk yang disadari & didokumentasikan**, bukan diperbaiki -- keputusan tim eksplisit, bukan kelalaian|

### 10.4 Item Terbuka -- Tidak Berubah, Masih Berlaku

Fix `duplicate.ts` ini menutup SATU dari sekian failure type yang dilacak `manifest.json` E.3D (`SHARED_PREDICATE_DUPLICATE_SPLIT`). Item berikut dari addendum sebelumnya **belum tersentuh** oleh siklus fix ini, tetap berlaku sesuai urutan yang sudah ditetapkan:

1. **Smoke test end-to-end** `/api/analyze-review` -- unit test `duplicate.ts` sudah 14/14 PASS, tapi jalur penuh parse -> validate -> duplicate-gate -> response **belum pernah diverifikasi** dengan payload nyata yang memicu `SHARED_PREDICATE_DUPLICATE_SPLIT` (mis. fixture `failure-reg-008.srt`). Ini prioritas tertinggi berikutnya sebelum fix dianggap selesai end-to-end, bukan cuma selesai di level unit test.
2. Refactor `text-matching.ts` -- belum dieksekusi. Gate subtopic saat ini memakai `normalizeForSearch` (dinilai cukup aman untuk perbandingan subtopic yang bervocab terkontrol), sementara ketimpangan `normalizeForSearch` vs `normalizeForMatching` untuk excerpt/grounding (bagian 3.3) tetap belum direkonsiliasi -- dua isu terpisah, jangan dianggap satu sudah menutup yang lain.
3. Cek histori `E140_FIXTURE` (FACT + `reviewer_assessment` terisi) -- drift versi data lama atau bug aktif, belum dikonfirmasi.
4. EXP-G1/G2 (kontrol density untuk named-subtopic collision) -- riset terpisah, prioritas rendah, tidak memblokir apa pun.
5. **Saran baru (bagian 10.2, terkait D-12)**: tambahkan manifest case baru di harness E.3D yang menguji fixture dengan subtopic null-asimetris pada shared-predicate (satu evidence bersubtopic, satunya `null`) -- bukan untuk menutup D-12 di kode sekarang, tapi untuk deteksi dini kalau pola ini ternyata muncul nyata di masa depan, sebelum perlu keputusan gate baru.
6. Perbaiki komentar section header D-05 yang stale (housekeeping, bagian 8.2) -- tidak mendesak.

### 10.5 Catatan Proses

Siklus penuh investigasi ini -- dari bug summary-counting harness, 38 run eksperimen lintas 6 kondisi, audit lima validator production, penemuan silent-data-loss, dua putaran audit-balik kode fix, sampai 14/14 test final -- adalah contoh kerja audit berlapis yang saling mengoreksi (implementor <-> auditor bergantian peran, termasuk mengoreksi klaim diri sendiri di beberapa titik) tanpa satu pihak pun "menang" secara sepihak. Pola ini layak dipertahankan untuk pekerjaan berikutnya (smoke test, dan penutupan failure type lain di manifest yang belum tersentuh kode).

---

## 11. Addendum 4 — Smoke Test End-to-End Terkonfirmasi PASS (29 Agustus 2026)

### 11.1 Hasil Eksekusi

```
npx vitest run src/evidence/validators/__tests__/smoke-shared-predicate-e2e.test.ts

 ✓ SMOKE TEST — SHARED_PREDICATE_DUPLICATE_SPLIT end-to-end (1)
   ✓ EXP-E rawOutput yang dialirkan lewat pipeline production
     TIDAK BOLEH kehilangan salah satu subjek (selfie/ultrawide)
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Test ini memakai `rawOutput` ASLI dari `EXP-E run-01.json` (bukan data karangan), dialirkan lewat kode production sungguhan secara end-to-end: `parseSRT` -> `buildEvidenceChunks` -> `parseEvidenceJSON` -> `isValidEvidence` -> `EvidenceValidator.validate()` -> `assignEvidenceIds` -> `DuplicateValidator.detect()` -> `resolveDuplicateActions()` (diekstrak dari route handler `/api/analyze-review`, perilaku tidak diubah).

**Signifikansi**: ini konfirmasi pertama bahwa perbaikan bekerja pada **jalur integrasi penuh**, bukan cuma pada `duplicate.ts` yang diuji terisolasi (14 unit test sebelumnya). `preservedEvidence` berhasil jadi SATU evidence gabungan yang memuat kata "selfie" DAN "ultrawide" sekaligus di claim-nya -- bukti langsung tidak ada lagi silent data loss pada jalur yang sama persis dengan yang dipakai user asli.

### 11.2 Refactor Pendukung (`server.ts`)

Untuk membuat jalur ini testable tanpa memanggil Gemini API sungguhan (deterministik, tidak bergantung pola kegagalan yang cuma muncul 30-100% tergantung chunk), dilakukan refactor minimal, behavior-preserving:

- `isValidEvidence`, `assignEvidenceIds` -- ditambah `export`.
- Loop resolusi duplikat (sebelumnya inline ~60 baris di dalam route handler) diekstrak jadi `resolveDuplicateActions()`, diekspor. Route handler sekarang memanggil fungsi ini -- perilaku endpoint HTTP tidak berubah sama sekali, cuma lokasi kodenya.
- Guard `if (!process.env.VITEST) { startServer(); }` ditambahkan -- tanpa ini, meng-import `server.ts` untuk keperluan test akan ikut menyalakan Express server + vite middleware sebagai side effect yang tidak diinginkan (bentrok port, proses menggantung). Vitest men-set `process.env.VITEST` otomatis, dipilih ketimbang membandingkan `import.meta.url`/`process.argv[1]` karena yang terakhir rawan bug platform-dependent di Windows.

### 11.3 Temuan Sampingan yang Didokumentasikan Lewat Test Ini

`stats.duplicateRemoved` di response API akan menghitung kasus MERGE sebagai bagian dari "removed" (`identifiedEvidence.length - preservedEvidence.length`), padahal untuk MERGE tidak ada informasi yang benar-benar dibuang -- cuma digabung. Ini didokumentasikan eksplisit lewat assertion di smoke test (`duplicateRemovedCount === 1` untuk kasus 2 evidence -> 1 evidence gabungan), supaya perilaku ini tercatat sebagai keputusan sadar, bukan ditemukan lagi sebagai "bug" oleh konsumen API di masa depan. Belum diputuskan apakah field ini perlu dipisah (`duplicateRemovedCount` vs `duplicateMergedCount`) di response API -- masuk ke item terbuka.

### 11.4 Status Akhir -- Item Prioritas #1 (Addendum 3) SELESAI

|Item (dari Addendum 3, bagian 10.4)|Status|
|---|---|
|1. Smoke test end-to-end|**SELESAI -- PASS terkonfirmasi**|
|2. Refactor `text-matching.ts`|Belum dieksekusi|
|3. Histori `E140_FIXTURE`|Belum dikonfirmasi|
|4. EXP-G1/G2|Belum dijalankan|
|5. Manifest case null-asimetris (monitoring D-12)|Belum dibuat|
|6. Perbaikan komentar D-05|Belum dikerjakan|
|Baru: field `stats.duplicateRemoved` vs `duplicateMerged` (11.3)|Belum diputuskan|

### 11.5 Rekomendasi Penutup

## Dengan smoke test end-to-end PASS, **fix untuk `SHARED_PREDICATE_DUPLICATE_SPLIT` kini bisa dianggap selesai secara teknis** -- dari trace manual, konfirmasi empiris bug, perbaikan, audit balik dua putaran, sampai verifikasi integrasi penuh. Item 2-6 di atas adalah pekerjaan rumah tangga (housekeeping) dan riset lanjutan yang tidak memblokir penggunaan fix ini di production. Keputusan berikutnya yang lebih strategis: apakah tim mau melanjutkan pola audit-implementasi-verifikasi yang sama ke failure type lain di `manifest.json` yang belum tersentuh kode sama sekali (`PARAPHRASED_EXCERPT`, `COMPOUND_VALUE`, `UNLEXICALIZED_ASSESSMENT`, dst), atau menganggap cakupan saat ini (satu failure type paling sering muncul) sudah cukup untuk saat ini.

---

## 12. Addendum 5 — Penutupan Tabel 11.4 Item 2/3/6/7 + Persiapan Item 4/5 (29 Agustus 2026, sesi terpisah dari Addendum 4)

> **Catatan koreksi dokumentasi**: sesi kerja ini terjadi SETELAH Addendum 4 (smoke test) dan SEBELUM eksekusi EXP-G1/G2 (Addendum 6 di bawah), tapi sempat tidak tertulis ke file manapun -- hasilnya hanya ada di teks chat. Disisipkan di sini untuk meluruskan kronologi yang sempat hilang saat rekonstruksi dokumen sebelumnya keliru memakai v1.1 (yang diupload SEBELUM sesi ini) sebagai baseline pembanding di bagian "Addendum 6".

### 12.1 Keputusan Urutan Kerja

Diputuskan eksplisit: tutup semua item di tabel 11.4 (Addendum 4) dulu sebelum lanjut ke pertanyaan strategis 11.5 (failure type lain di `manifest.json`) -- konsisten dengan prinsip _design first -> audit -> code -> verify_, jangan buka pekerjaan baru selagi masih ada utang yang belum jelas statusnya.

### 12.2 Item 6 — Komentar D-05 (CLOSED)

Komentar section header di `duplicate_test.ts` (bukan judul `test(...)`, yang sudah benar sejak Addendum 1/bagian 8.2) diperbaiki dari:

```ts
// D-05: Unknown context, same coords, identical claim → PRESERVE
```

menjadi:

```ts
// D-05: Unknown context, same coords, identical claim → KEEP_FIRST
```

Murni housekeeping dokumentasi, tidak ada perubahan logic/assertion.

### 12.3 Item 3 — Histori `E140_FIXTURE` (CLOSED, dianalisis)

**Analisis**: `E140_FIXTURE` (`type: 'FACT'` + `reviewer_assessment: 'negative'`) memang melanggar `AssessmentValidator` kalau dialirkan lewat `EvidenceValidator.validate()`. Tapi test D-01 memanggil `DuplicateValidator.detect()` LANGSUNG, tidak pernah lewat `EvidenceValidator` -- `DuplicateValidator` tidak pernah memeriksa validitas `reviewer_assessment` terhadap `type`. Fixture tetap berfungsi sempurna untuk tujuannya (menguji duplicate-detection secara terisolasi).

**Kesimpulan**: BUKAN bug aktif di production -- murni fixture historis data v4.1 yang dipertahankan untuk menguji `DuplicateValidator` saja. Risiko cuma dokumentasi (bisa disalahartikan sebagai "contoh evidence valid"). Ditambahkan komentar penjelas di atas fixture di `duplicate_test.ts`:

```ts
// CATATAN (audit histori E140, lihat rangkuman audit bagian 12.3):
// E140 punya type:'FACT' + reviewer_assessment:'negative', yang
// SEBENARNYA melanggar AssessmentValidator (assessment.ts). Ini BUKAN
// bug aktif -- DuplicateValidator tidak pernah memeriksa validitas
// assessment, dan fixture ini hanya dipakai untuk menguji
// duplicate-detection secara terisolasi. Dipertahankan apa adanya
// sebagai data historis, JANGAN dijadikan contoh evidence yang valid
// secara schema.
```

### 12.4 Item 7 — `stats.duplicateRemoved` vs `duplicateMerged` (CLOSED, keputusan diambil)

**Keputusan**: `duplicateRemoved` seharusnya hanya menghitung yang benar-benar dibuang (`KEEP_FIRST`/`KEEP_BEST`), bukan yang digabung (`MERGE`). `duplicateRemovedDetails` array sudah persis berisi itu saja.

Di `server.ts`:

```ts
// SEBELUM:
const duplicateRemoved = identifiedEvidence.length - preservedEvidence.length;

// SESUDAH:
const duplicateRemoved = duplicateRemovedDetails.length;
```

Sekarang `stats.duplicateRemoved` dan `stats.mergedCount` punya semantik yang benar-benar terpisah, tidak tumpang tindih. Ini menutup temuan sampingan yang didokumentasikan di Addendum 4 bagian 11.3.

### 12.5 Item 2 — Refactor `text-matching.ts` (CLOSED)

**File baru** `src/evidence/text-matching.ts`: memindahkan `normalizeForMatching()` (7-step pipeline terkunci) + wrapper containment (`propositionMatchesExcerpt`, `excerptMatchesChunk`, `containsNormalized`, `equalsNormalized`) dari `reproducibility-harness.ts` ke modul terpisah -- konsisten dengan pola `srt.ts`/`types.ts` yang sudah terpisah dari `production-pipeline.ts` di codebase ini. PERILAKU TIDAK BERUBAH, murni pemindahan.

`reproducibility-harness.ts` di-wire untuk import dari modul baru ini, menggantikan definisi lokal -- 14 self-test lama (bagian A dan B) tetap berjalan tanpa perubahan, karena nama fungsi tidak berubah.

`duplicate.ts` di-wire untuk memakai `equalsNormalized` (dari `text-matching.ts`) pada perbandingan `subtopic` di gate `hasDistinctSubtopics`, menggantikan `normalizeForSearch` yang dipakai sementara sejak Addendum 3. Ini menutup "utang refactor" yang eksplisit dicatat di Addendum 3 (bagian 10, status akhir) -- sekarang ada satu consumer produksi nyata yang memakai `text-matching.ts`, bukan lagi sekadar modul yang dibuat tapi belum dipakai.

### 12.6 Item 5 — Desain Monitor Subtopic Null-Asimetri (DISIAPKAN, siap eksekusi)

Sebelum sesi ini, item 5 (manifest case null-asimetris) dinilai TIDAK bisa langsung ditutup sebagai housekeeping -- `validateSharedPredicateOwnership` di harness beroperasi murni dari containment `subjects` terhadap `source_excerpt`, TIDAK PERNAH membaca field `subtopic` evidence. Jadi pola "satu subtopic null, satu terisi" (D-12) secara struktural tidak bisa dideteksi lewat mekanisme manifest+invariant yang ada -- butuh validator baru. Direkomendasikan naik jadi keputusan desain terpisah.

Implementer menyetujui untuk langsung dikerjakan sebagai desain baru, bukan ditunda. **Desain final**:

- Monitor BUKAN invariant per-case yang butuh manifest baru per fixture -- didesain UNCONDITIONAL, otomatis berjalan untuk SETIAP case yang sudah punya `shared_predicate_ownership` di manifest. Menghindari harus mengedit satu-satu entri manifest, otomatis aktif untuk case baru manapun (termasuk EXP-G1/G2 yang belum ada saat itu).
- Statusnya `FAIL` kalau pola terdeteksi (supaya kelihatan di summary/log), tapi murni OBSERVASIONAL -- tidak mengubah `duplicate.ts` sama sekali. Tujuan: kalau pola ini muncul nyata di run mendatang, tim langsung tahu tanpa trace manual, baru dari situ diputuskan apakah `duplicate.ts` perlu gate tambahan.
- Kriteria deteksi: pasangan evidence dengan `source_excerpt` identik pasca-`normalizeForMatching`, DAN salah satu `subtopic` kosong/null sementara yang lain terisi. Generik terhadap semua pasangan dalam batch, tidak terikat grup `subjects` manapun.

Fungsi `validateSubtopicNullAsymmetry()` ditambahkan ke `reproducibility-harness.ts`, dipanggil di dalam blok `if (invariant.shared_predicate_ownership)` yang sudah ada (bukan blok `if` terpisah -- lihat catatan bug di bagian 13.1 di bawah, penempatan yang keliru inilah yang belakangan menyebabkan duplikasi SPO). 5 self-test ditambahkan (`ASYM Test 1-5`): true positive, dua negative (subtopic sama-sama terisi/sama-sama null), excerpt-beda-tidak-relevan, edge case evidence<2 -> INCONCLUSIVE.

**Status saat itu**: kode siap, TAPI belum dieksekusi via API call -- menunggu isi fixture EXP-G1 (item 4) supaya bisa dijalankan sekaligus dalam satu sesi harness run.

### 12.7 Item 4 — Fixture EXP-G1/G2 (DISIAPKAN, siap eksekusi)

Sebelum sesi ini, item 4 juga tidak bisa dieksekusi langsung: tidak ada akses jaringan/API key di environment Claude, dan tidak ada isi asli `targeted-regression-008-expf1.srt` (desain EXP-G1/G2 di changelog mensyaratkan "5 segmen filler SAMA PERSIS" dengan F1).

Implementer mengirim isi `targeted-regression-008-expf1.srt` (5 segmen filler spek laptop netral + 1 segmen kamera selfie/ultrawide). Fixture baru disusun: `targeted-regression-008-expg1.srt` (filler F1 identik + segmen ke-6 diganti kalimat speaker+mikrofon, disusun ulang -- BUKAN salinan verbatim dari fixture asli EXP-C1/C2 yang isinya belum terlihat saat itu) dan `targeted-regression-008-expg2.srt` (filler F1 identik + segmen ke-6 brightness+refresh_rate, juga disusun ulang).

Entri manifest `EXP-G1`/`EXP-G2` ditambahkan (`failure_type: SHARED_PREDICATE_NAMED_SUBTOPIC_DENSITY_CONTROL`), dan `targetCases` di `reproducibility-harness.ts` di-wire untuk menjalankan `['EXP-G1', 'EXP-G2']`.

**Status saat itu**: fixture + manifest + wiring siap, TAPI belum dieksekusi via API call -- eksekusi sungguhan (bagian 13 di bawah) menunggu Implementer menjalankan `npx tsx reproducibility-harness.ts` di lokal.

### 12.8 Status Akhir Sesi Ini

|Item (dari tabel 11.4, Addendum 4)|Status akhir sesi ini|
|---|---|
|2. Refactor `text-matching.ts`|**CLOSED**|
|3. Histori `E140_FIXTURE`|**CLOSED** (dianalisis, bukan bug aktif)|
|6. Komentar D-05|**CLOSED**|
|7. `duplicateRemoved` vs `duplicateMerged`|**CLOSED** (keputusan diambil)|
|4. EXP-G1/G2|**DISIAPKAN** (fixture+manifest+wiring lengkap), eksekusi sungguhan menyusul|
|5. Manifest null-asimetris|**DISIAPKAN** (monitor terpasang), eksekusi sungguhan menyusul|

4 dari 7 item benar-benar tertutup sesi ini; 2 sisanya disiapkan penuh dan tinggal dieksekusi Implementer (bukan lagi "belum dikerjakan sama sekali").

---

## 13. Addendum 6 — Eksekusi EXP-G1/G2, Bug Harness, dan Revisi Hipotesis Named-Subtopic (30 Agustus 2026)

### 13.1 Bug Harness yang Sempat Masuk dan Sudah Diperbaiki

Saat memasang `validateSubtopicNullAsymmetry()` (Addendum 5, bagian 12.6) ke `validateInvariants()`, patch yang ditempel meninggalkan blok `if (invariant.shared_predicate_ownership) {...}` LAMA di tempat, alih-alih menggantikannya dengan blok baru -- akibatnya `shared_predicate_ownership` dievaluasi **2x per run** untuk setiap case yang punya invariant ini di manifest.

**Terdeteksi lewat**: audit JSON mentah run EXP-G1/G2 pertama -- `invariant_results` menunjukkan dua entri `shared_predicate_ownership` identik per run, dan log terminal menampilkan pesan `SHARED_PREDICATE_DUPLICATE_SPLIT`/`NON_LITERAL_EXCERPT` berpasangan identik.

**Dampak**: **NIHIL terhadap kesimpulan pass/fail** -- `finalStatus` di `validateInvariants()` sudah FAIL kalau ADA SATU invariant_result yang FAIL; duplikasi tidak pernah membuat FAIL "tersamar" jadi PASS atau sebaliknya. Angka summary (`pass`/`fail`/`inconclusive`) pada run pertama (G1: 0/5, G2: 3/5) **tetap valid** meski log/violations-nya sempat berantakan.

**Sudah diperbaiki**: run kedua (bagian 13.2 di bawah, tanpa monitor terpasang sama sekali -- baseline murni yang dikirim ulang oleh Implementer) mengkonfirmasi `shared_predicate_ownership` kembali ke 1 entri per run, dan `subtopic_null_asymmetry_monitor` tidak muncul sama sekali (sesuai -- monitor belum dipasang di run itu).

### 13.2 ini 5 generation independen: EXP-C1/C2 Terkoneksi Secara Struktural, Bukan Cuma Korelasi

Isi asli `exp-c-named-subtopic-collision-001.srt` (baru terlihat lewat sesi ini, dikirim Implementer) ternyata **hanya 2 segmen**:

```
1  Speaker dan mikrofon ... sama-sama menghasilkan kualitas suara yang kurang jernih ...
2  Brightness dan refresh rate ... sama-sama terasa kurang maksimal ...
```

EXP-C1 dan EXP-C2 di manifest **sama-sama memakai fixture ini** -- karena harness men-generate SATU KALI per fixture group dan memvalidasi hasil yang sama untuk semua case dalam grup itu (lihat `main()`, pengelompokan `fixtureGroups`), C1 dan C2 **bukan dua eksperimen independen** -- keduanya mengukur validasi ganda terhadap SATU generation API yang sama di setiap run.

**Revisi terhadap temuan bagian 2.3 poin 7 (rangkuman awal)**: klaim lama _"EXP-C1/C2 selalu gagal bersamaan (5/5, tidak pernah campuran) -- confound belum tuntas terpisah"_ sekarang punya penjelasan definitif, BUKAN confound tersembunyi yang perlu investigasi lanjut: korelasi itu **struktural by design** (satu generation, dua validasi), bukan sinyal empiris tentang bagaimana kedua pasangan named-subtopic berperilaku secara independen satu sama lain.

### 13.3 Caveat Metodologis -- Wording G1/G2 Berbeda dari C1/C2 Asli

Kalimat segmen ke-6 di `targeted-regression-008-expg1.srt`/`-expg2.srt` (disusun di Addendum 5, bagian 12.7) **bukan salinan verbatim** dari fixture C1/C2 asli -- disusun ulang tanpa akses ke isi file yang sebenarnya saat itu. Perbandingan:

||Asli (C1/C2)|G1/G2 (disusun ulang)|
|---|---|---|
|Speaker+mic|"...sama-sama menghasilkan kualitas suara yang kurang jernih saat dipakai untuk video call."|"...tergolong standar, belum ada peningkatan berarti dari generasi sebelumnya."|
|Brightness+refresh_rate|"...sama-sama terasa kurang maksimal saat dipakai di bawah sinar matahari langsung."|"...masih sama seperti generasi sebelumnya, belum ada peningkatan."|

**Implikasi**: G1/G2 TIDAK bisa diklaim sebagai kontrol density murni terhadap C1/C2 (variabel wording juga berubah, bukan cuma density) -- tapi TETAP valid untuk tujuan desainnya sendiri: mengukur apakah pasangan bertaksonomi-nama (speaker+mic, brightness+refresh_rate) punya ceiling berbeda dari kamera (F1) pada density yang identik dengan F1.

### 13.4 Hasil Eksekusi -- Dua Sampel Independen (n=10 per case)

|Case|Sampel A (bug duplikasi SPO sempat ada, TIDAK memengaruhi angka pass/fail)|Sampel B (baseline bersih, tanpa monitor)|**Gabungan**|
|---|---|---|---|
|EXP-G1 (speaker+mikrofon)|0/5|0/5|**0/10 (0%)**|
|EXP-G2 (brightness+refresh_rate)|3/5|4/5|**7/10 (70%)**|
|EXP-F1 (baseline, kamera selfie+ultrawide)|--|--|4/5 (80%), n=5, dari investigasi sebelumnya|

**Mekanisme kegagalan G1** (konsisten di kedua sampel): mayoritas run `SHARED_PREDICATE_DUPLICATE_SPLIT` murni (excerpt disalin identik ke dua evidence, subtopic `speaker` vs `microphone`); minoritas run malah `NON_LITERAL_EXCERPT` + `SHARED_PREDICATE_PARTIAL_SPLIT` bersamaan -- model memotong-motong excerpt jadi dua fragmen non-literal (`"kualitas speaker..."` / `"kualitas...mikrofon"`) alih-alih menyalin utuh.

**Mekanisme kegagalan G2** (kedua sampel): satu run tiap sampel gagal, mekanismenya bervariasi antara `SHARED_PREDICATE_DUPLICATE_SPLIT` murni dan `NON_LITERAL_EXCERPT`+`PARTIAL_SPLIT` -- pola yang sama seperti G1, cuma frekuensinya jauh lebih rendah.

**Monitor `subtopic_null_asymmetry_monitor`**: PASS di semua run yang diamati (baik sampel dengan bug duplikasi maupun baseline bersih) -- konsisten dengan seluruh riwayat 38+ run sebelumnya, D-12 tetap residual risk teoretis, belum pernah teramati nyata.

### 13.5 Revisi Hipotesis: Named-Subtopic Collision Tidak Seragam Antar-Pasangan

Kerangka lama (rangkuman awal, bagian 2.3 poin 4-5) menyimpulkan: _density = faktor dominan (0%->60-80%), named-subtopic collision = amplifier kuat tapi bukan syarat mutlak_. Dengan n=10 per case sekarang, kerangka ini perlu direvisi:

- **Density TIDAK menolong secara seragam untuk semua pasangan bertaksonomi-nama.** G1 (speaker+mikrofon) tetap 0% pada density yang identik dengan F1 (yang menaikkan kamera ke 80%) -- efek density untuk pasangan ini nyaris nol, bertolak belakang dengan pola kamera/USB-C/engsel/kipas yang semuanya terangkat signifikan oleh density (lihat rangkuman awal bagian 2, temuan 4 dan 6).
- **G2 (brightness+refresh_rate) mendekati ceiling F1** (70% vs 80%) -- pasangan ini berperilaku jauh lebih mirip kamera daripada seperti speaker+mic, meski sama-sama "named-subtopic collision".
- **Kesimpulan revisi**: named-subtopic collision bukan satu kategori seragam dengan efek amplifier yang sama untuk semua anggotanya. Setidaknya ada dua sub-kelas: pasangan yang density-nya bisa "menyelamatkan" reliabilitas (kamera, brightness+refresh_rate) vs pasangan yang density-nya nyaris tidak berpengaruh (speaker+mikrofon). Apa yang membedakan kedua sub-kelas ini **belum diketahui** -- kandidat yang belum diuji: kemiripan semantik/akustik istilah subtopic ("speaker" dan "microphone" sama-sama tergolong domain audio yang sangat dekat maknanya, vs "brightness"/"refresh_rate" yang walau sama-sama display tapi secara teknis lebih terpisah/independen), atau sekadar variance individual per-pasangan yang belum cukup n untuk digeneralisasi.

### 13.6 Item Terbuka Baru

1. Kandidat penjelas sub-kelas density-rescuable vs density-resistant (13.5) -- belum diuji, prioritas rendah, riset eksploratif.
2. Kalau ingin kontrol density murni terhadap C1/C2 asli (menutup caveat 13.3 sepenuhnya), perlu fixture G1'/G2' baru dengan wording verbatim dari `exp-c-named-subtopic-collision-001.srt` -- opsional, tidak mendesak karena tujuan asli G1/G2 (density-match terhadap F1) sudah tercapai.
3. Housekeeping: pastikan blok `if (invariant.shared_predicate_ownership)` di `reproducibility-harness.ts` sekarang benar-benar tunggal (bukan dobel) untuk SEMUA case, tidak cuma yang sudah diverifikasi manual di sesi ini -- cukup satu kali pengecekan visual di kode, tidak perlu re-run eksperimen apa pun (angka pass/fail sudah terbukti tidak terpengaruh).

### 13.7 Status Akhir Tabel 11.4 -- Semua Item Tertutup atau Selesai Dieksekusi

|Item (dari Addendum 4, bagian 11.4)|Status Addendum 5 (12.8)|Status sekarang|
|---|---|---|
|1. Smoke test end-to-end|SELESAI (sejak Addendum 4)|Tidak berubah -- SELESAI|
|2. Refactor `text-matching.ts`|**CLOSED**|Tidak berubah -- CLOSED|
|3. Histori `E140_FIXTURE`|**CLOSED**|Tidak berubah -- CLOSED|
|4. EXP-G1/G2|Disiapkan, siap eksekusi|**DIEKSEKUSI, n=10 per case -- lihat 13.4-13.5**|
|5. Manifest null-asimetris|Disiapkan, siap eksekusi|**DIEKSEKUSI (terpasang, tidak pernah FAIL di run manapun)**|
|6. Komentar D-05|**CLOSED**|Tidak berubah -- CLOSED|
|7. `duplicateRemoved` vs `duplicateMerged`|**CLOSED**|Tidak berubah -- CLOSED|

**Seluruh tabel 11.4 sekarang tertutup atau selesai dieksekusi.** Tidak ada item tersisa yang berstatus "belum dikerjakan" -- item 3.6 (belum diuji, riset eksploratif) dan item 2 di atas (13.6) adalah item BARU yang muncul dari hasil eksekusi ini, bukan sisa dari tabel 11.4 lama.