# Changelog — `ANALYSIS_PROMPT_EVIDENCE` (`prompts.ts`)

> Catatan metodologis: changelog ini disusun ulang (retroactive) dari isi
> `prompts.ts` saat ini dan riwayat audit/regression cycle yang tercatat.
> Untuk versi v3 dan v4, batas persis antar-perubahan direkonstruksi dari
> komentar internal prompt itu sendiri (bukan dari diff historis yang
> disimpan terpisah), karena file diff eksplisit tidak tersedia untuk
> rentang tersebut. Mulai v4.2, entri di bawah didukung oleh dokumentasi
> patch dan hasil reproducibility harness yang eksplisit.

---

## v3 — Baseline Audit (165 evidence, v2 → v3)

Hasil audit terhadap 165 evidence hasil ekstraksi v2. Menambahkan delapan
"ATURAN BARU" bertingkat prioritas SANGAT TINGGI:

1. Larangan mengisi `reviewer_assessment` dari inferensi angka/fakta
   (skor benchmark, durasi baterai, dll) — assessment harus berasal dari
   kata evaluatif eksplisit.
2. Preservasi qualifier numerik (`sekitar`, `hingga`, `kisaran`, dst) —
   larangan membulatkan/mempresisikan angka perkiraan.
3. Evidence atomik wajib — pemecahan compound value/property menjadi
   evidence terpisah (mis. Wi-Fi + Bluetooth + NFC → 3 evidence).
4. Deterministic rule multi-dimensi (Aturan A/B) untuk kasus resolusi+fps
   dsb — satu capability = satu evidence, dimensi berbeda = evidence
   berbeda.
5. Context tidak boleh bertentangan dengan claim/source_excerpt.
6. Split bi-polar opinion (satu pernyataan, dua arah penilaian berbeda).
7. Perbaikan pemetaan topic/subtopic yang sering salah di v2.
8. Larangan forward inference (memakai info kalimat berikutnya untuk
   memperkaya evidence kalimat sebelumnya).

**Status**: superseded oleh v4 (deterministic rule diperketat) dan v4.2
(precision patch tambahan).

---

## v4 — Deterministic Multi-Dimension Rule

Mengunci Aturan A/B dari v3 sebagai **wajib**, bukan pilihan bebas model:

- **Aturan A**: satu capability yang disebut bersamaan sebagai satu
  kesatuan (mis. "1080p 30 fps") → tetap satu evidence, value string
  gabungan.
- **Aturan B**: lebih dari satu capability berbeda pada dimensi apa pun
  → wajib evidence terpisah, tidak boleh digabung meski satu kalimat.

Juga memperketat field `certainty`: prioritas `explicit`, `inferred`
hanya untuk kasus elipsis subjek yang praktis pasti dari struktur
kalimat — bukan untuk melengkapi informasi yang sebenarnya tidak ada.

**Status**: aktif sampai v4.6 (lihat revisi "Uji cepat" pada entri v4.6 —
teks asli diganti, bukan sekadar ditambah).

---

## v4.2 — Precision Patch (Audit E001–E198, Phase D)

Menambahkan blok "ATURAN TAMBAHAN UNTUK KUALITAS EVIDENCE (v4.2)" dengan
prioritas SANGAT TINGGI, mencakup:

- **A. Claim Grounding & Source-Excerpt Ownership** — setiap unsur claim
  harus didukung langsung `source_excerpt`; larangan menggabungkan
  potongan evidence berbeda menjadi satu excerpt sintetis.
- **B. Context Ownership / No Context Leakage** — context tidak boleh
  "dipinjam" dari evidence tetangga tanpa provenance yang sama.
- **B2. Segment Boundary sebagai Batas source_excerpt** — aturan hard
  boundary per-segmen SRT, dengan uji internal "apakah segmen pertama,
  berdiri sendiri, sudah satu proposisi lengkap?" Termasuk penanganan
  elipsis subjek Bahasa Indonesia (proposisi tetap dianggap lengkap
  walau subjek dielisikan, selama makna proposisi sendiri utuh).
- **C. Reviewer_Assessment Provenance** — assessment wajib punya bukti
  evaluatif eksplisit pada evidence itu sendiri, bukan inferensi dari
  angka/fakta/konsekuensi.
- **D. Semantic Atomicity** — split independent proposition, bukan
  semua atribut; property independence overrides surface cohesion.
  Termasuk contoh WAJIB SPLIT untuk dua capability bernama independen
  dalam satu kalimat (mis. NFC + USB OTG, Fingerprint + Face Unlock).
- **SHARED PREDICATE OWNERSHIP** — multiple subjects + satu shared
  predicate → default **satu** evidence (jangan split kecuali predikat
  masing-masing subjek dinyatakan independen).
- **E–G**: Multi-Property Value Guard, Comparison Metadata Integrity,
  Duplicate & Parent-Child Control.

**Catatan retroaktif penting**: worked example kanonik SHARED PREDICATE
OWNERSHIP ("kamera selfie dan ultrawide... perlu peningkatan") sejak
awal secara struktural berada di persimpangan dua aturan yang berpotensi
tarik-menarik — SHARED PREDICATE OWNERSHIP (mengarahkan gabung, karena
predikat dibagi bersama) versus pola D. SEMANTIC ATOMICITY untuk dua
capability bernama independen (mengarahkan pisah, seperti pola NFC+USB
OTG). Tarik-menarik ini tidak termanifestasi sebagai kegagalan nyata
sampai siklus v4.6 (lihat entri v4.6 di bawah) — dicatat di sini secara
retroaktif karena akar strukturalnya memang sudah ada sejak v4.2.

**Status v4.2 terkait bug SHARED_PREDICATE_OWNERSHIP**: aturan sudah ada
di prompt sejak v4.2, namun bug terkait (model memecah kalimat
shared-predicate menjadi dua evidence, dilaporkan reproducible 100% pada
satu siklus audit sebelum v4.4) tidak punya manifest regression case
sendiri sampai siklus REG-008 (lihat bagian setelah v4.5 di bawah).

---

## v4.4 — Resolusi Konflik pada Aturan #1 (Absence-of-Feature Exception)

Perubahan tunggal namun berdampak: mencabut pengecualian lama pada
"ATURAN BARU #1" yang sebelumnya berbunyi *"kecuali reviewer eksplisit
menyebutnya sebagai kekurangan"*. Pengecualian itu memungkinkan model
memberi `reviewer_assessment: negative` pada FACT ketiadaan fitur asalkan
reviewer menyebutnya framing sebagai kekurangan di kalimat lain.

v4.4 mencabut pengecualian tersebut sepenuhnya dan menegaskan: **REVIEWER
ASSESSMENT PROVENANCE (bagian C, v4.2) berlaku tanpa pengecualian** — kata
evaluatif dan objek yang dievaluasi harus sama-sama berada di dalam
`source_excerpt` evidence itu sendiri.

Menambahkan sub-aturan eksplisit untuk kasus **framing evaluatif yang
terpisah segmen dari objek konkretnya** (mis. "apa yang kurang bagi
kami?" di satu segmen, "tidak ada opsi 60fps" di segmen lain):
- Dilarang menggabungkan keduanya jadi satu evidence OPINION.
- Dilarang meminjam kata evaluatif dari segmen framing untuk evidence
  FACT di segmen lain.
- Dilarang memakai `certainty: inferred` untuk menjembatani keduanya.
- Segmen framing generik tanpa objek konkret **tidak menghasilkan
  evidence sama sekali**.

Dikonfirmasi lewat regression cycle: **REG-002** (`FACT_ASSESSMENT`,
fixture `failure-reg-002.srt`) — 5/5 PASS pada seluruh siklus sejak v4.4
sampai siklus terkini, tidak pernah regresi.

---

## v4.5 — Patch C: CHANGE ≠ EVALUATION

### Latar belakang
Reproducibility harness (temperature 0.1, n=5) menemukan **REG-005**
(`UNLEXICALIZED_ASSESSMENT`, fixture `failure-reg-004.srt`) gagal
reproducible: model salah mengklasifikasikan deskripsi perubahan kondisi
netral (mis. *"kualitas video ... sudah mulai menurun"*) sebagai OPINION
dengan `reviewer_assessment` terisi, padahal tidak ada judgment eksplisit
— hanya kata perubahan (`menurun`) yang salah dibaca sebagai sinyal
evaluatif.

### Perubahan
Ditambahkan tepat setelah definisi `OBSERVATION` dan sebelum `OPINION`
di bagian TYPE EVIDENCE, tiga blok baru:

**1. CHANGE ≠ EVALUATION**
Kata/frasa perubahan kondisi (`menurun`, `turun`, `berkurang`, `melemah`,
`meningkat`, `naik`, `bertambah`, `membaik`, `mulai muncul`, `mulai
terlihat`, `hilang`, `berubah`, `menjadi`, `tetap`, dst.) **tidak boleh
sendirian** menyebabkan klasifikasi OPINION — default tetap OBSERVATION,
`reviewer_assessment: null`.

**2. LEXICAL MATCH ≠ SEMANTIC EVALUATION**
Kata yang secara leksikal *bisa* dipakai sebagai evaluasi (mis. "baik")
tidak otomatis membuat evidence jadi OPINION. Yang menentukan adalah
fungsi semantik kata dalam kalimat — apakah reviewer benar-benar
memberikan penilaian, atau kata itu cuma bagian deskripsi kondisi.
Contoh kontras eksplisit: *"detail tetap terjaga dengan baik"* →
OBSERVATION, vs *"hasilnya sangat baik"* → OPINION.

**3. ASSESSMENT PROVENANCE REMAINS MANDATORY**
Menegaskan ulang (tanpa melemahkan v4.2/v4.4): `reviewer_assessment`
wajib melekat langsung pada evidence, berasal dari judgment eksplisit,
bukan inferensi dari perubahan/angka/fakta/konsekuensi.

### Validasi (regression harness, model `gemini-3.5-flash-lite`, T=0.1, n=5)

| Case | Failure type | Hasil final |
|---|---|---|
| REG-005 | UNLEXICALIZED_ASSESSMENT | 5/5 PASS |
| REG-002 | FACT_ASSESSMENT (regresi v4.4) | 5/5 PASS |
| REG-001B | PARAPHRASED_EXCERPT (regresi lama) | 5/5 PASS* |
| REG-006 | CHANGE_WORD_GENERALIZATION_FAILURE (sinonim CHANGE di luar daftar prompt) | 5/5 PASS |
| REG-007 | OPINION_OVERCORRECTION (opini eksplisit tidak boleh tertekan jadi OBSERVATION) | 5/5 PASS |

\* REG-001B sempat 4/5 pada dua siklus terpisah (run index berbeda),
akar penyebab: manifest `required_propositions` terlalu literal
(prefix `"di "` hilang dari `source_excerpt` model di sebagian run).
**Bukan regresi Patch C** — dikonfirmasi lewat perbaikan manifest
(prefix dihapus) yang menstabilkan hasil ke 5/5 tanpa perubahan prompt.
Lihat juga Prioritas #1 di bawah — akar masalah ini kemudian ditelusuri
lebih dalam sebagai isu robustness matcher harness, bukan sekadar
perbaikan manifest satu kali.

REG-006/REG-007 baru bisa diklaim tervalidasi **secara otomatis** setelah
dispatch `expected_type_assessment` ditambahkan ke `validateInvariants()`
di harness (sebelumnya invariant ini tercantum di manifest tapi tidak
pernah dieksekusi — silent validator gap, terpisah dari perubahan
prompt). Self-test 4 assertion (false negative, true positive,
NOT_FOUND, case-insensitive match) dikonfirmasi bisa membedakan
PASS/FAIL/INCONCLUSIVE sebelum dipakai untuk validasi sungguhan.

**Status**: FROZEN untuk scope yang diuji (REG-001B, REG-002, REG-005,
REG-006, REG-007). Prompt tidak diubah lagi sampai v4.6.

---

## Prioritas #1 — Harness Robustness & Manifest Authoring Discipline

*(Perubahan infrastruktur test, BUKAN perubahan `prompts.ts`. Dicatat di
sini karena menjadi prasyarat metodologis untuk seluruh siklus
SHARED_PREDICATE_OWNERSHIP setelahnya.)*

### Latar belakang
Catatan kaki REG-001B di v4.5 (prefix `"di "` hilang) awalnya ditangani
sebagai perbaikan manifest satu kali. Audit lanjutan menyimpulkan ini
gejala dari kelemahan infrastruktur bersama: tiga validator matching
(`validateRequiredPropositions`, `validateLiteralExcerpt`,
`validateExpectedTypeAssessment`) masing-masing memakai normalisasi
string yang berbeda-beda dan tidak konsisten satu sama lain.

### Perubahan
Empat opsi desain dipertimbangkan (normalisasi ringan/stopword-removal,
normalisasi permukaan murni, multiple-accepted-phrasings di manifest,
fuzzy/similarity matching). **Opsi stopword-removal, multiple-phrasings,
dan fuzzy matching ditolak** — argumen intinya: fuzzy matching berisiko
false-PASS (dianggap lebih berbahaya dari false-FAIL untuk regression
harness), dan multiple-phrasings/stopword-removal berisiko membuat
manifest/matcher diam-diam menjadi katalog parafrase alih-alih kontrak
perilaku yang jelas.

Disepakati: **satu fungsi `normalizeForMatching()`** sebagai single
source of truth, dipakai via tiga wrapper containment (arah
needle/haystack berbeda sesuai semantik masing-masing validator).
Pipeline 7 langkah: NBSP → spasi, unicode quote → kanonik, trim,
collapse whitespace, case-fold `toLocaleLowerCase('id-ID')`, strip
SATU trailing `.` (bukan `..`/`...`), trim ulang (step tambahan setelah
bug idempotence ditemukan — lihat di bawah).

**Bug ditemukan sebelum implementasi jalan**: audit trace manual
menemukan pipeline 6-langkah awal tidak idempotent untuk input
`"jitter . "` (spasi sebelum titik) — `normalize(normalize(x))` ≠
`normalize(x)`. Diverifikasi ulang secara independen via eksekusi node
langsung, dikonfirmasi nyata, diperbaiki dengan menambah step 7 (trim
ulang trailing whitespace setelah strip period).

`validateAssessmentLexicon()` (dipakai REG-005) turut direfactor
belakangan ke primitive yang sama, menutup celah NBSP pada frasa lexicon
multi-kata (mis. `"tergolong​oke"` dengan NBSP tidak match tanpa
refactor).

Deliverable ketiga: `MANIFEST_AUTHORING_CHECKLIST.md` — dokumen
independen berisi 4 prinsip struktural penulisan `required_propositions`
(mulai dari kata konten, hindari ketergantungan urutan klausa spesifik,
berhenti sebelum kata fungsi penutup, dry-run terhadap sample nyata
sebelum masuk manifest) — sengaja bukan daftar kasus, untuk mencegah
jadi katalog tambal-sulam.

### Validasi
28 self-test assertion (14 `normalizeForMatching`, 5
`validateExpectedTypeAssessment` termasuk equivalence lama-vs-baru, 3
`validateAssessmentLexicon`), semuanya dijalankan sungguhan (bukan
dibaca) via `npx tsx`, lulus 28/28. Regression guard REG-001B, REG-002,
REG-005, REG-006, REG-007 dikonfirmasi ulang tetap 5/5 PASS pasca-refactor
tiga validator.

**Status**: CLOSED.

---

## REG-008 — Regression Case Baru untuk SHARED_PREDICATE_OWNERSHIP

### Latar belakang
Bug SHARED_PREDICATE_OWNERSHIP yang dicatat sebagai Item Terbuka sejak
v4.2 (lihat entri v4.2 di atas) akhirnya diberi regression case
tersendiri.

### Desain
`validateSharedPredicateOwnership()` diimplementasikan dengan kontrak
`full`/`touching` (bukan union murni — union ditolak setelah ditemukan
menghasilkan false-FAIL untuk evidence yang menyentuh satu subjek secara
tidak terkait/independen dari proposisi shared-predicate yang
sebenarnya):

- `full(group)` = evidence yang memuat SEMUA subjek grup (containment
  independen per-subjek, bukan satu substring gabungan).
- `touching(group)` = evidence yang memuat MINIMAL SATU subjek.
- `full.size === 1` → PASS. `full.size > 1` → FAIL
  (`SHARED_PREDICATE_DUPLICATE_SPLIT`). `full.size === 0 &&
  touching.size > 1` → FAIL (`SHARED_PREDICATE_PARTIAL_SPLIT`). Selain
  itu → INCONCLUSIVE (`NOT_FOUND` atau `PARTIAL_EXTRACTION`).

Fixture `failure-reg-008.srt`: 4 grup shared-predicate (speaker
kiri/kanan, tombol volume atas/bawah, foto siang/foto malam, kamera
selfie/ultrawide) + 2 kontrol negatif (RAM+storage, battery+charging,
sengaja tidak dijadikan assertion formal — beda domain aturan). 6
self-test (T1–T6) mencakup true positive, partial split, duplicate
split, NOT_FOUND, unrelated-single-subject-mention (kasus yang
membedakan `full`/`touching` dari union), dan partial-extraction.

### Validasi awal (prompt v4.5, sebelum Patch D)
5 run: grup entitas diskret (speaker, tombol, kamera selfie/ultrawide)
**15/15 PASS sempurna**. Grup `foto siang + foto malam` gagal 4/5 dengan
dua mekanisme berbeda: fabrikasi elipsis untuk memaksa excerpt terlihat
literal (`NON_LITERAL_EXCERPT`, 2 run) dan duplikasi excerpt identik ke
dua evidence (`SHARED_PREDICATE_DUPLICATE_SPLIT`, 2 run). 1/5 PASS bersih
(satu evidence utuh, literal). Ditelusuri manual raw JSON tiap run —
disimpulkan ini reproduksi bug asli, bukan cacat desain fixture (kalimat
memakai `"sama-sama"`, penanda struktural sama seperti grup entitas yang
tidak pernah gagal).

**Status**: baseline pra-Patch D terkonfirmasi. Lihat v4.6 di bawah untuk
hasil pasca-patch dan regresi yang ditemukan.

---

## REG-009 — SHARED_PREDICATE_PAIRED_CONDITION_CONTROL

Fixture `targeted-regression-003.srt`: 2 grup kondisi/waktu (WiFi
indoor/outdoor, suhu gaming/charging), tanpa grup entitas diskret sama
sekali. Hasil: 3/5 PASS, 2/5 FAIL — mengonfirmasi pola kegagalan
condition-based tidak spesifik ke fixture REG-008, dan menguatkan
hipotesis awal pembeda entitas vs kondisi/modifier.

**Catatan koreksi**: klaim "0 kegagalan across 10 run gabungan
REG-008+REG-009" untuk grup entitas pernah muncul dalam satu audit —
ini keliru. REG-009 sama sekali tidak menguji grup entitas; angka yang
benar adalah 0 dari 5 kesempatan (REG-008 saja).

---

## REG-010 (versi awal, superseded) — ditemukan bug kontaminasi silang antar-grup

Fixture `targeted-regression-004.srt` awalnya dirancang dengan 4 grup
dalam satu manifest case, dua di antaranya berbagi substring subjek
identik (`"suhu perangkat saat gaming"` muncul sebagai subjek di dua
grup berbeda — gaya elipsis dan gaya eksplisit). Ditelusuri via raw JSON
run-01/run-02: evidence dari satu segmen (mis. segmen 5, gaya eksplisit)
ikut terhitung sebagai `full match` untuk grup segmen lain (segmen 1,
gaya elipsis) karena validator beroperasi murni lewat containment
lexical tanpa pengetahuan asal segmen — bukan bug validator, melainkan
cacat desain manifest (subjek antar-grup tidak boleh overlap secara
substring).

**Resolusi**: didesain ulang jadi REG-010A–E, satu grup per fixture
terisolasi.

---

## REG-010A–E — Fixture Terisolasi

- **REG-010A** (`targeted-regression-005a.srt`): kondisi/waktu, gaya
  elipsis (`"saat gaming dan saat charging"`).
- **REG-010B** (`...005b.srt`): lokasi, gaya elipsis (`"di dekat kamera
  dan di area layar"`).
- **REG-010C** (`...005c.srt`): kondisi/waktu, gaya eksplisit (`"saat
  gaming dan suhu perangkat saat charging"`).
- **REG-010D** (`...005d.srt`): lokasi, gaya eksplisit.
- **REG-010E** (`...005e.srt`): kontrol positif — nilai berbeda antar
  kondisi (38°C vs 45°C), harus tetap 2 evidence (Aturan B normal).

### Validasi awal (prompt v4.5, sebelum Patch D)
A: 0/5, B: 1/5, C: 0/5, D: 0/5 — total 1/20 (5%) PASS untuk pola
kondisi/lokasi dengan hasil setara. E: 5/5 PASS (kontrol nilai-berbeda
tidak terpengaruh). Hipotesis literal-keyword-trigger (`"saat"`,
`"kondisi"`) pada Aturan B lama **terbantah** oleh REG-010D — kalimatnya
sama sekali tidak mengandung kata kunci tersebut, namun tetap gagal 5/5.
Satu-satunya PASS (REG-010B run-5) diverifikasi lewat raw JSON: genuine
(satu evidence literal utuh, bukan artefak under-extraction) —
memperkuat, bukan melemahkan, kesimpulan bahwa model *bisa* benar tapi
sangat condong salah untuk pola ini.

---

## v4.6 — Patch D: MODIFIER KONDISI/LOKASI ≠ SUBJECT INDEPENDEN

### Latar belakang
Root cause disederhanakan menjadi konflik tekstual langsung antara dua
bagian `prompts.ts`: **Aturan B (v4)** memerintahkan split wajib untuk
*"kondisi pengujian berbeda"* tanpa syarat nilai, sementara **SHARED
PREDICATE OWNERSHIP (v4.2)** memerintahkan gabung untuk subjek yang
berbagi satu predikat — dua instruksi yang saling bertentangan untuk
pola permukaan yang sama (banyak subjek/kondisi, satu kalimat).

### Perubahan (4 bagian, semua di `prompts.ts`)

**1. SHARED PREDICATE OWNERSHIP — 4 worked example baru + penegasan.**
Ditambahkan setelah "Contoh SALAH" yang sudah ada:
- Contoh 1: kondisi/waktu berbeda, hasil SAMA → SATU evidence.
- Contoh 2: kondisi/waktu berbeda, hasil BERBEDA → DUA evidence
  (kontras langsung dengan Contoh 1, domain sama, isolasi variabel
  nilai).
- Contoh 3: modifier LOKASI berbeda, hasil SAMA → SATU evidence
  (generalisasi lintas jenis modifier).
- Contoh 4: kesetaraan hasil TANPA kata penanda eksplisit seperti
  "sama-sama" — menguji generalisasi prinsip, bukan hafalan pola
  lexical.

**2. Boundary note di G. DUPLICATE & PARENT-CHILD CONTROL.**
Menegaskan contoh dedup lama (`45°C dekat kamera` vs `45°C area layar`
"bukan duplicate") adalah keputusan pasca-ekstraksi, bukan lisensi untuk
memecah satu shared-predicate proposition saat ekstraksi awal.

**3. Cross-reference dua arah** antara SHARED PREDICATE OWNERSHIP dan
Aturan B.

**4. Penggantian penuh (bukan penambahan) teks "Uji cepat" di Aturan B.**
Teks lama (*"kondisi berbeda → WAJIB pisah"*, tanpa syarat nilai) diganti
seluruhnya — bukan ditambah klarifikasi di sebelahnya — karena audit
menemukan membiarkan teks lama utuh akan mempertahankan instruksi yang
saling bertentangan secara langsung. Uji baru eksplisit menyatakan
pembeda BUKAN kehadiran kata penanda tertentu, melainkan kesetaraan
nilai/hasil/penilaian itu sendiri (baik dinyatakan eksplisit maupun
tersirat tanpa kata penanda apa pun) — desain ini sengaja meniru prinsip
`LEXICAL MATCH ≠ SEMANTIC EVALUATION` (Patch C, v4.5) yang sudah terbukti
bekerja untuk masalah serupa di domain lain.

### Validasi ronde 1 (Patch D, sebelum guard tambahan)

| Case | Sebelum Patch D | Sesudah Patch D |
|---|---|---|
| REG-010A | 0/5 | 3/5 |
| REG-010B | 1/5 | 5/5 |
| REG-010C | 0/5 | 5/5 |
| REG-010D | 0/5 | 5/5 |
| REG-010E (kontrol) | 5/5 | 5/5 (tidak berubah) |
| REG-001B/002/005/006/007 | 5/5 | 5/5 (tidak berubah) |

**Regresi tak terduga ditemukan** di REG-008 (target awal bukan grup
ini): grup entitas diskret yang sebelumnya 15/15 PASS sempurna ikut
terdampak — `kamera selfie + ultrawide` turun ke 1/5 PASS,
`tombol volume atas + bawah` turun ke 4/5 PASS. Ditelusuri raw JSON:
mekanismenya `SHARED_PREDICATE_DUPLICATE_SPLIT` murni (excerpt disalin
identik ke dua evidence, claim dipersempit per subjek) — bukan
fabrikasi, `excerpt_must_be_literal` selalu PASS. Target asli
(`foto siang + malam`) sama sekali tidak muncul sebagai pelanggaran di
run-run ini.

### Mitigasi — Penegasan Eksplisit

Ditambahkan satu paragraf **"PENEGASAN — PATCH D TIDAK MENGUBAH DEFAULT
SHARED PREDICATE"** tepat di akhir blok Patch D: untuk subjek/entitas
diskret yang berbagi satu predikat, tetap SATU evidence secara default;
larangan eksplisit memecah hanya karena subjek punya nama/subtopic
berbeda; penanda diagnostik eksplisit — *"jika source_excerpt untuk
kedua subjek akan identik karena berasal dari satu proposisi sumber yang
sama, itu adalah tanda bahwa evidence harus tetap digabung"* — secara
langsung menyasar tanda tangan bug yang terlihat di raw JSON. Wording
final memilih formulasi yang mempertahankan prinsip verifikasi aktif
(bukan *"tanpa perlu mengecek ulang"*, yang dinilai berisiko membuat
model berhenti verifikasi untuk kasus yang justru butuh diverifikasi
seperti REG-010E).

### Validasi ronde 2 (Patch D + Penegasan)

| Case | Sebelum Penegasan | Sesudah Penegasan |
|---|---|---|
| REG-008: `kamera selfie + ultrawide` | 1/5 | **3/5 (masih 2 FAIL)** |
| REG-008: `tombol atas + bawah` | 4/5 | 5/5 (pulih penuh) |
| REG-010A–E (screening n=3) | — | 15/15 PASS (tidak ada regresi baru dari penambahan guard) |

Mekanisme dua kegagalan tersisa pada `kamera selfie + ultrawide`
diverifikasi identik dengan sebelum penegasan ditambahkan (duplikasi
excerpt utuh, bukan fabrikasi) — penegasan menurunkan frekuensi, tidak
menghilangkan mekanismenya.

### Hipotesis akar masalah tersisa (belum diuji)
Kalimat kanonik `"kamera selfie dan ultrawide... perlu peningkatan"`
diduga secara struktural rentan sejak v4.2 (lihat catatan retroaktif di
entri v4.2) karena berada di persimpangan SHARED PREDICATE OWNERSHIP dan
pola "dua capability bernama independen WAJIB SPLIT" (NFC+USB OTG) di
D. SEMANTIC ATOMICITY — beda dari `tombol atas/bawah` yang murni dua
posisi fisik tanpa tarik-menarik serupa, sehingga penegasan generik
cukup untuk menstabilkannya sepenuhnya sementara kamera tidak.

**Eksperimen C (diusulkan, belum dijalankan)**: menambahkan catatan
kontras eksplisit di worked example kanonik SHARED PREDICATE OWNERSHIP
itu sendiri, membedakan pola ini dari NFC+USB-OTG berdasarkan ada/tidaknya
predikat yang dibagi bersama — sengaja diuji terpisah dari opsi
reposisi Patch D (Eksperimen B) supaya tidak mencampur dua variabel
sekaligus.

**Status**: **v4.6 BELUM FROZEN.** Berhasil penuh untuk target awal
(REG-010A–D, meski REG-010A masih 3/5 bukan 5/5) dan untuk regresi
`tombol atas+bawah` (pulih ke 5/5). **Satu regresi terbuka**: REG-008
`kamera selfie + ultrawide` bertahan di 3/5 PASS, mekanisme terverifikasi
konsisten (`SHARED_PREDICATE_DUPLICATE_SPLIT`, excerpt duplikat literal).
Tahap 3 (REG-001B/002/005/006/007 sebagai regression guard terjauh)
**ditunda** sampai regresi ini tertutup — sesuai keputusan eksplisit
untuk tidak lanjut ke regression guard yang lebih jauh selama guard yang
lebih dekat masih menunjukkan kegagalan.

---

---

## Addendum (28 Agustus 2026) — Investigasi `SHARED_PREDICATE_DUPLICATE_SPLIT` (E.3D Reproducibility Harness)

> Catatan konteks: bagian ini BUKAN perubahan versi prompt. `ANALYSIS_PROMPT_EVIDENCE`
> tetap FROZEN di v4.6 sepanjang seluruh investigasi ini — tidak ada satu kata pun
> yang diubah. Ini adalah log investigasi reproducibility harness (E.3D) yang
> berujung pada keputusan untuk TIDAK menambal prompt lebih jauh, dan sebagai
> gantinya membangun mitigasi di layer kode. Didokumentasikan di sini karena
> langsung relevan dengan pemahaman kualitas `ANALYSIS_PROMPT_EVIDENCE` saat ini.

### 0. Bug Infrastruktur yang Ditemukan & Diperbaiki Duluan

Sebelum data eksperimen di bawah bisa dipercaya, ditemukan bug pada
`reproducibility-harness.ts`: summary per-case (`pass`/`fail`/`inconclusive`)
dihitung ulang dengan `fs.readdirSync(caseDir)` — membaca ulang SELURUH isi
folder output, bukan dari hasil generation yang baru saja berjalan. Akibatnya
file `run-*.json` sisa sesi lama (mis. bekas konfigurasi `RUNS=5` yang lebih
besar dari `RUNS` saat ini) ikut mencemari angka summary tanpa peringatan
(gejala: `"runs":3,"pass":5"` — pass melebihi total run).

**Fix**: `resetCaseDir()` membersihkan folder case sebelum run pertama
ditulis; summary dihitung dari array `results` in-memory selama eksekusi
berjalan (pola yang sudah benar di `runCaseIsolated`, sekarang disamakan di
jalur grouped-generation `main()`). Semua data pada bagian 1-4 di bawah ini
dikumpulkan **setelah** fix ini terpasang — dianggap bersih dari kontaminasi.

### 1. Kronologi Eksperimen

| Case | Hipotesis yang diuji | Konfigurasi | n | Pass rate |
|---|---|---|---|---|
| REG-008 (baseline) | Model gagal shared-predicate default pada ≥1 dari 4 grup | 6 segmen, 4 grup shared-predicate | 13 | 9/13 (~69%), **hanya** grup kamera selfie+ultrawide yang pernah gagal |
| EXP-B1 | Model bisa split kalau memang wajib (nilai independen) | 6 segmen, nilai numerik berbeda per subjek (termasuk kamera selfie/ultrawide MP) | 5 | 5/5 (100%) |
| EXP-B2 | Same-value→merge vs different-value→split (domain suhu) | isolasi, 1 kalimat | 5 | 5/5 (100%) — dipasangkan dengan REG-010A (same-value, sudah 3/3 PASS sebelumnya) |
| EXP-C1/C2 | Kolisi taksonomi subtopic (speaker+mikrofon; brightness+refresh_rate — keduanya named subtopic) menyebabkan split, meniru pola kamera | isolasi, 2 kalimat dalam 1 chunk sparse | 5+5 | **0/5, 0/5 (0%)** — tapi confound: keduanya SELALU gagal bersamaan di setiap run (lihat temuan 2) |
| EXP-D1/D2 | Deconfound: apakah kegagalan kamera spesifik ke wording literal contoh di prompt? | isolasi, 1 kalimat, wording di-reword dari contoh prompt | 5+5 | 0/5, 0/5 (0%) — gugur: gagal juga meski wording sudah diubah total dari contoh prompt |
| EXP-E | Verbatim control (kalimat sama persis dengan contoh prompt) | isolasi, 2 segmen | 5 | 0/5 (0%) |
| EXP-F1 | Length control TANPA priming analog | 6 segmen filler netral + 1 target kamera | 5 | **4/5 (80%)** — ceiling tertinggi yang pernah teramati |
| EXP-F2 | Length control DENGAN 3× priming analog (contoh shared-predicate lain sebelum target) | 6 segmen (3 priming + target) | 5 | 3/5 (60%) — priming TIDAK menaikkan pass rate seperti diprediksi; malah sedikit lebih rendah dari F1 (dalam noise n=5) |

**Total n=38 run lintas 6 eksperimen (REG-008, D1, D2, E, F1, F2) yang melacak
pasangan kamera selfie+ultrawide secara spesifik** — tidak pernah mencapai
100% pass di konfigurasi manapun; ceiling terbaik 80% (EXP-F1).

### 2. Temuan Kunci

1. **Hipotesis "proximity Patch D" — gugur.** Posisi section prompt bukan
   penyebab utama (tidak pernah diuji langsung, tapi seluruh evidence di
   bawah mengarah ke penyebab lain).
2. **Hipotesis "wording persis contoh prompt" — gugur.** EXP-D1/D2 gagal
   sama seperti EXP-E meski kalimat sudah di-reword total dari contoh
   `SHARED PREDICATE OWNERSHIP` di `ANALYSIS_PROMPT_EVIDENCE`.
3. **Hipotesis "priming analog menaikkan reliabilitas" — gugur, arahnya
   flat-to-negatif.** EXP-F2 (dengan priming) tidak lebih baik dari EXP-F1
   (tanpa priming) pada n=5; selisihnya berada dalam noise statistik.
   Catatan tambahan: exemplar priming (Port USB-C depan/belakang) di EXP-F2
   sendiri ikut gagal merge di KEDUA run yang FAIL — diverifikasi langsung
   dari raw JSON run-01 dan run-02, bukan cuma satu run seperti dugaan awal.
4. **Kekayaan/density chunk adalah faktor dominan yang terverifikasi kuat.**
   Isolasi (0-2 segmen) → 0%. Chunk kaya (6 segmen) → 60-80%. Efeknya besar
   dan konsisten di semua kondisi yang diuji.
5. **Named-subtopic collision (selfie/ultrawide, speaker/microphone,
   brightness/refresh_rate — semua named di daftar contoh subtopic prompt)
   adalah AMPLIFIER kuat, BUKAN syarat satu-satunya.** EXP-C1/C2 (named
   subtopic, chunk sparse) jatuh ke 0%, jauh di bawah rate kamera di kondisi
   sparse serupa (EXP-D/E juga 0%, jadi sebenarnya konsisten) — namun counter-
   example penting: **Port USB-C bagian depan/belakang TIDAK punya named
   subtopic** (subtopic-nya `null` di raw output) tapi tetap gagal merge di
   EXP-F2. Jadi mekanisme kegagalan dasar (`SHARED_PREDICATE_DUPLICATE_SPLIT`)
   bisa terjadi pada pasangan APA PUN, dengan named-subtopic collision sebagai
   faktor yang memperparah, bukan pemicu eksklusif.
6. **Divergensi antar-pasangan dalam satu generation yang sama itu nyata.**
   Di EXP-F2, dalam generation yang SAMA: engsel kiri/kanan dan kipas
   kiri/kanan tetap merge benar, sementara USB-C dan kamera split. Ini
   menunjukkan kegagalan bukan "mode atomisasi total per-generation", tapi
   spesifik ke pasangan yang memang rapuh.
7. **Confound penting yang belum sepenuhnya terpisah:** EXP-C1/C2 SELALU
   gagal bersamaan (5/5 run, tidak pernah campuran) — berbeda dengan EXP-F2
   di atas. Kemungkinan penyebab: chunk EXP-C isinya 100% proposisi
   shared-predicate tanpa jeda FACT/MEASUREMENT netral (density confound
   yang belum dikontrol terpisah dari efek named-subtopic itu sendiri).

### 3. Model Kerja Saat Ini (Belum Final)

Dua faktor yang saling memperkuat, diamati konsisten di semua data:
- **Kekayaan/density chunk** menaikkan reliabilitas dasar drastis (0% → 60-80%).
- **Jumlah keputusan shared-predicate simultan** dalam satu generation
  sedikit menurunkan rate untuk pasangan yang memang rapuh, di atas efek
  density (F1: 1 keputusan → 80%; F2/REG-008: 4 keputusan → 60-69%).
- Framing alternatif (proporsi SP-terhadap-total-segmen, bukan hitungan
  absolut) cocok sama baiknya dengan data yang ada — **belum ada titik data
  yang memisahkan kedua framing ini** (semua konfigurasi yang diuji
  mengelompok di dua ekstrem: sparse 1-2 segmen atau kaya 6 segmen, belum
  ada titik tengah 3-4 segmen).

### 4. Eksperimen Lanjutan yang Disepakati (Belum Dijalankan)

**EXP-G1 / EXP-G2** — revisi dari usulan "EXP-C' 6-segmen" senior team.
Desain awal mereka (kedua pasangan speaker+mic DAN brightness+refresh_rate
dalam satu chunk) ditolak karena menciptakan 2 keputusan SP simultan,
mencemari perbandingan terhadap ceiling EXP-F1 (yang diukur pada 1
keputusan). Revisi: **dua fixture terpisah**, masing-masing struktur
identik dengan `targeted-regression-008-expf1.srt` (5 segmen filler sama
persis), hanya segmen ke-6 diganti:
- EXP-G1: filler F1 + kalimat speaker+mikrofon (dari EXP-C1)
- EXP-G2: filler F1 + kalimat brightness+refresh_rate (dari EXP-C2)

Tujuan: isolasi bersih pertanyaan "apakah pasangan bertaksonomi-nama tetap
punya ceiling lebih rendah dari kamera/USB-C setelah density disamakan
persis dengan F1 (80%)?" — belum dijalankan, fixture belum dibuat.

### 5. Keputusan Arsitektur

1. **Prompt `ANALYSIS_PROMPT_EVIDENCE` tetap FROZEN v4.6.** Tidak ada
   rencana penambalan lebih lanjut untuk `SHARED_PREDICATE_DUPLICATE_SPLIT`
   di level prompt — riwayat investigasi (proximity → wording → priming →
   taksonomi) menunjukkan akar sebab terus bergeser dan tidak pernah
   menghasilkan pengungkit yang menutup ceiling sampai 100% pada konfigurasi
   manapun yang diuji (n=38, terbaik 80%).
2. **Mitigasi dipindah ke layer kode**: safety-net auto-merge di
   `src/evidence/validators/duplicate.ts` (dan/atau `evidence-validator.ts`)
   yang mendeteksi ≥2 evidence dengan `source_excerpt` identik/nyaris-identik
   dalam satu batch, lalu auto-merge (excerpt identik penuh) atau quarantine
   untuk review manual (excerpt mirip tapi tidak identik — pola ini sudah
   menunjukkan instabilitas tambahan di EXP-D2 run#3: `NON_LITERAL_EXCERPT`
   + `SHARED_PREDICATE_PARTIAL_SPLIT` bersamaan). **Belum diimplementasikan**
   — baru sebatas sketsa kontrak.
3. **Prasyarat sebelum safety-net ditulis**: `normalizeForMatching` dan
   wrapper containment-nya (`propositionMatchesExcerpt`, `excerptMatchesChunk`,
   `excerptContainsNeedle`) harus dipindah dari `reproducibility-harness.ts`
   (saat ini hanya di sisi riset) ke **modul baru `src/evidence/text-matching.ts`**
   — BUKAN digabung ke `production-pipeline.ts`. Alasan: `production-pipeline.ts`
   punya cakupan SSOT yang sudah didefinisikan eksplisit di header-nya sendiri
   (SRT parsing, chunking, evidence JSON parsing, prompt builder) — text
   normalization/matching adalah concern independen, konsisten dengan pola
   yang sudah dipakai codebase ini (`srt.ts`, `types.ts` sudah terpisah dari
   `production-pipeline.ts`). Baik harness (riset) maupun
   `duplicate.ts`/`evidence-validator.ts` (production) akan mengimpor dari
   modul yang sama ini — mencegah drift antara logika matching riset vs
   production, sesuai prinsip SSOT yang sudah dipatok tim. **Belum
   dieksekusi.**
4. **Catatan penting — dua sistem validator yang harus tidak tertukar:**
   - `src/evidence/validators/*` = validator PRODUCTION, dipanggil `server.ts`
     saat user asli memakai aplikasi (`EvidenceValidator.validate()`,
     `DuplicateValidator.detect()`).
   - Fungsi `validateInvariants`/`validateSharedPredicateOwnership`/dkk. di
     dalam `reproducibility-harness.ts` = validator RISET E.3D, khusus
     mengukur PASS/FAIL eksperimen terhadap `expected_invariant` di
     `manifest.json`. **Tidak pernah dipanggil `server.ts`, tidak menyentuh
     user asli.**
   - Sebelum implementasi safety-net dimulai: **wajib baca dulu isi
     `duplicate.ts` yang sudah ada** untuk memastikan tidak ada logic
     deteksi-duplikat yang sudah ada di sana yang akan tumpang tindih/konflik
     dengan pendekatan `normalizeForMatching`.

### 6. Item Terbuka

1. Jalankan EXP-G1/EXP-G2 (fixture belum dibuat).
2. Framing "jumlah absolut keputusan SP" vs "proporsi SP/total-segmen" —
   belum bisa dibedakan dari data yang ada; butuh titik data di panjang
   chunk menengah (3-4 segmen) kalau ingin dituntaskan (prioritas rendah,
   tidak memblokir apa pun).
3. Root cause spesifik kenapa Port USB-C depan/belakang rapuh (tanpa
   named-subtopic collision) — belum dipahami, tidak diinvestigasi lebih
   lanjut karena signature kegagalannya (excerpt identik penuh) sudah
   tertangkap oleh desain safety-net yang sama dengan kamera, terlepas dari
   akar sebabnya.
4. Refactor `text-matching.ts` — belum dieksekusi (lihat poin arsitektur #3).
5. Implementasi safety-net di `duplicate.ts`/`evidence-validator.ts` — belum
   dieksekusi, menunggu refactor #4 selesai lebih dulu (urutan ini sengaja,
   supaya tidak menciptakan implementasi lokal yang harus di-refactor ulang).