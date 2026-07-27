# Sistem Quality Control Otomatis

Tujuan: sebelum aset naik status "usable" dan tersedia untuk dipakai (termasuk dikonsumsi MK Connect Content AI), ia harus lolos pemeriksaan otomatis berlapis. Manusia tetap jadi gerbang akhir, tapi otomasi menangani triase sebanyak mungkin (pola "auto-filter + human gate", `02-research-market.md` §4 poin 5).

## 1. Prinsip

- QC bukan satu skor tunggal — ia adalah **beberapa pemeriksaan independen**, masing-masing bisa pass/fail/flag sendiri.
- Kegagalan pada pemeriksaan identitas (Product/Character Lock) selalu **blocking** — tidak bisa di-override otomatis, wajib review manusia.
- Kegagalan pada pemeriksaan kualitas umum (artefak, estetika) bisa **auto-reject** (kirim ulang ke generation) atau **flag untuk review**, tergantung tingkat keyakinan.

## 2. Product Fidelity Check

Mengacu Product DNA record (`03-consistency-framework.md` §1.1):
- **Logo match**: deteksi region logo (object detector ringan) + embedding similarity terhadap logo kanonik (vector search) → skor kemiripan.
- **Warna**: sampling warna area kunci kemasan dibanding nilai HEX/Pantone di DNA record, dengan toleransi delta yang ditetapkan per produk.
- **Similarity umum**: CLIP-style similarity antara aset hasil generation dan foto referensi kanonik produk sebagai skor pelengkap.
- **Negative constraint check**: verifikasi tidak ada elemen dari daftar exclusion Product DNA yang muncul (mis. teks tambahan, kemasan versi lama).

## 3. Character Fidelity Check

Mengacu Character DNA record (`03-consistency-framework.md` §1.2):
- **Face similarity**: embedding wajah (face-recognition style) dibanding reference set Character DNA.
- **Konsistensi atribut**: warna rambut, outfit, aksesori signature — dicek terhadap deskripsi/negative constraints DNA record.
- **Anatomi**: deteksi artefak umum generative AI pada manusia (tangan/jari cacat, pose anatomis mustahil) — area riset aktif; implementasi awal bisa memakai classifier/VLM-based artifact detector, ditingkatkan seiring waktu.

## 4. Technical Quality Check

Independen dari identitas — berlaku untuk semua aset:
- Resolusi & rasio sesuai target platform
- Deteksi artefak umum: teks yang tidak terbaca/nonsensikal pada label, pencahayaan yang secara fisik tidak masuk akal (bayangan salah arah), pola tekstur berulang tidak natural
- Skor estetika umum (opsional, sebagai sinyal tambahan bukan gate keras)

## 5. Skema Skor & Keputusan

Setiap aset yang keluar dari pipeline generation mendapat **QC Report** berisi:

| Dimensi | Skor | Ambang blocking |
|---|---|---|
| Product Fidelity | 0–100 | Di bawah ambang → blocking, tidak bisa auto-approve |
| Character Fidelity | 0–100 | Di bawah ambang → blocking |
| Technical Quality | 0–100 | Di bawah ambang rendah → auto-reject (requeue generation); di ambang menengah → flag review |
| Brand Compliance | 0–100 | Di bawah ambang → flag review |

Keputusan akhir otomatis:
- **Semua dimensi di atas ambang tinggi** → auto-approve ke status "usable" (opsional, tergantung kebijakan risiko yang dipilih perusahaan — lihat `08-roadmap-risks.md`)
- **Ada dimensi di zona menengah** → masuk antrean review manusia dengan skor & alasan flag ditampilkan
- **Ada dimensi identitas di bawah ambang blocking** → auto-reject, tidak masuk antrean review sama sekali (dikembalikan ke pipeline untuk regenerasi, atau ditandai gagal untuk investigasi template/DNA)

## 6. QC sebagai Sinyal Loop, Bukan Cuma Gate

QC Report per aset disimpan penuh (bukan cuma pass/fail) dan menjadi input utama loop evolusi Prompt Engine (`04-prompt-engine.md` §5) — skor per template/per DNA version diagregasi untuk mendeteksi template yang secara sistematis menghasilkan skor rendah, sebelum itu jadi masalah volume besar.

## 7. Keterbatasan yang Diakui Sejak Awal

- Deteksi artefak anatomi (tangan, dsb.) masih area riset aktif secara industri — bukan solved problem (`02-research-market.md` §3 poin QC). Rencana realistis: mulai dengan model/classifier yang tersedia, terima false-negative rate awal lebih tinggi, tingkatkan lewat data hasil review manusia dari waktu ke waktu.
- QC otomatis mengurangi beban review manusia, bukan menghilangkannya — terutama di masa awal sebelum ambang skor tervalidasi dengan data produksi nyata milik perusahaan sendiri.
