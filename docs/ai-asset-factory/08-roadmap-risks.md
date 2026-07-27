# Roadmap, Analisis Risiko & Rekomendasi

## 1. Roadmap Bertahap (Indikatif)

Fase ini murni urutan logis pembangunan, bukan komitmen tanggal — timeline aktual ditentukan setelah dokumen arsitektur direview dan tim/resource implementasi ditentukan.

**Fase 1 — Fondasi**
- Storage & Index dasar (`06-storage-architecture.md`): struktur folder Drive, skema metadata, database index minimal
- Identity Module: alur onboarding Product/Character DNA + turnaround sheet generation + human approval
- Satu provider generation terintegrasi (mulai dari yang paling matang berdasarkan riset, mis. yang mendukung role-tagged reference dengan baik)

**Fase 2 — Produksi Terkontrol**
- Prompt Engine: template library dasar + versioning (tanpa loop evolusi otomatis dulu)
- Generation Orchestrator: job queue dengan retry/backoff/dead-letter (poin yang secara sengaja memperbaiki kelemahan MK Connect)
- QC Gate versi awal: mulai dari pemeriksaan yang paling reliable (similarity produk via reference image, deteksi logo dasar) — anatomi/artefak kompleks menyusul

**Fase 3 — Human-in-the-loop Lengkap**
- Review & Approval Console
- Brief Composer lengkap
- Asset Library Browser dengan pencarian semantik

**Fase 4 — Closed-Loop Optimization**
- Agregasi skor QC per template/identity
- Loop evolusi Prompt Engine otomatis (`04-prompt-engine.md` §5)
- Perluasan QC (deteksi artefak anatomi, brand compliance lanjutan)

**Fase 5 — Integrasi dengan MK Connect (opsional, dipicu kebutuhan nyata)**
- API tipis agar MK Connect bisa memicu/menarik aset secara terprogram
- Hanya dilakukan setelah Publishing Engine & Analytics MK Connect Content AI cukup matang untuk benar-benar mengonsumsi output secara otomatis (`01-research-mkconnect.md` §3.8–3.9) — sebelum itu, integrasi manual (aset tersedia di Drive, tim ambil manual) sudah cukup dan tidak perlu dipaksakan.

## 2. Analisis Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Over-investasi di teknik konsistensi sebelum volume produksi cukup untuk membenarkan biaya (mis. training LoRA per karakter) | Biaya/waktu terbuang di awal | Fase 1 mulai dengan teknik tanpa-training (reference conditioning/InstantID) untuk karakter/produk baru; upgrade ke LoRA hanya untuk yang sudah terbukti dipakai berulang volume tinggi |
| QC otomatis salah gate (false positive tinggi → semua ditolak; false negative tinggi → aset buruk lolos) | Beban review manusia melonjak, atau kualitas turun tanpa terdeteksi | Mulai ambang skor konservatif (lebih banyak masuk zona review manusia daripada auto-approve/auto-reject) sampai ada data produksi nyata cukup untuk mengkalibrasi ambang |
| Ketergantungan pada satu provider generation eksternal (perubahan harga/API/ketersediaan) | Produksi terhenti bila provider bermasalah | Desain Generation Orchestrator provider-agnostic sejak awal (mengikuti pola `AIProvider` abstraction yang sudah terbukti di MK Connect) |
| Drift dokumen vs implementasi (arsitektur berubah saat coding, dokumen tidak diupdate) | Dokumen jadi tidak dipercaya, keputusan desain hilang jejak | Dokumen ini adalah baseline — perubahan signifikan saat implementasi didokumentasikan sebagai revisi, bukan ditinggalkan |
| Asumsi bahwa MK Connect Content AI akan segera bisa mengonsumsi output secara otomatis | Waktu terbuang membangun integrasi API yang belum ada konsumennya | Integrasi API (Fase 5) sengaja ditunda sampai ada kebutuhan nyata terverifikasi — lihat batas scope di `07-system-architecture.md` §6 |
| Storage Google Drive: kuota/service account tunggal jadi single point of failure operasional | Produksi terhenti jika kuota habis/kredensial bermasalah | Monitoring kuota rutin sebagai bagian operasional (bukan cuma teknis); pola sudah ada presedennya di MK Connect, tinggal direplikasi |
| Tim kecil, scope besar (semua 8 dokumen ini bisa jadi terlalu ambisius sekaligus) | Kelelahan / setengah jalan di banyak hal | Roadmap fase eksplisit di atas — Fase 1–2 harus selesai solid sebelum Fase 3–4 dimulai, jangan paralel semua |

## 3. Rekomendasi

1. **Mulai dari Identity Module + Storage**, bukan dari Generation Orchestrator — karena tanpa DNA record yang solid, semua generation berikutnya tidak punya sesuatu untuk "dikunci".
2. **QC Gate versi awal boleh sederhana**, tapi pipa datanya (skor tersimpan terstruktur per aset) harus benar sejak hari pertama — karena ini yang jadi bahan bakar loop evolusi Fase 4.
3. **Jangan bangun ulang apa pun yang sudah menjadi tanggung jawab MK Connect** (publishing, scheduling, campaign analytics) — godaan ini besar karena KontenAI di MK Connect masih banyak stub, tapi memperbaikinya bukan mandat AI Asset Factory.
4. **Selaraskan skema metadata dengan `kontenai_assets`** MK Connect sejak desain awal (nama field company/project/campaign/platform/content_type/tags) — biaya penyelarasan sekarang jauh lebih murah daripada migrasi nanti.
5. Sebelum implementasi kode dimulai, dokumen ini (khususnya `07-system-architecture.md` skema DB dan `03-consistency-framework.md` stack teknik) sebaiknya direview eksplisit oleh pemilik keputusan sebelum dikunci sebagai baseline implementasi.

## 4. Status Dokumen

Seluruh riset yang mendasari dokumen ini (arsitektur MK Connect, modul Content AI, sistem Brief, kompetitor, teknik konsistensi, praktik studio besar) telah dilakukan dan didokumentasikan di `01-research-mkconnect.md` dan `02-research-market.md`. Dokumen `03`–`07` adalah desain turunan dari riset tersebut. Belum ada implementasi kode untuk AI Asset Factory. Menunggu review & persetujuan sebelum Fase 1 dimulai.
