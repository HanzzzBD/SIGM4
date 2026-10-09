// Acceptance PR-02-34 (keputusan 77; FR-10.1 AC 1–3, RE-02, RE-07, RE-08, UX §7.6.5): P-68
// Approval Rules + P-69 Editor dengan pratinjau — di atas router, gerbang sesi, dan klien HTTP
// yang sama dengan produksi (server tiruan pada adapter axios).
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { jumlahSyarat, urutkan } from "../../src/modules/m10-approval/ApprovalRulesPage";
import { keDefinisi, keModelKondisi, modelDari, periksaModel } from "../../src/modules/m10-approval/model";
import type { AturanTersimpan } from "../../src/modules/m10-approval/api";
import { ME_ADMIN, gagal, pasangServer, pelanggaranAxe, renderAplikasi, sukses } from "../helpers";
import type { Jawaban, Permintaan } from "../helpers";

const IZIN_ADMIN = { ...ME_ADMIN.permissions, "approval_rule.view": "all", "approval_rule.manage": "all", "role.view": "all" };
const ROLES = [
    { id: "1", kode: "R-01", nama: "Administrator", permissions: [{ kode: "approval.decide" }] },
    { id: "3", kode: "R-03", nama: "Kepala Sekolah", permissions: [{ kode: "approval.decide" }] },
    { id: "7", kode: "R-07", nama: "Siswa", permissions: [] },
];
const aturan = (id: number, jenis: AturanTersimpan["jenis_pengajuan"], prioritas: number, extra: Partial<AturanTersimpan> = {}): AturanTersimpan => ({
    id,
    jenis_pengajuan: jenis,
    prioritas,
    status_aktif: true,
    versi: 1,
    kondisi: {},
    steps: [{ order: 1, approver_type: "role", approver_role: "R-03", sla_hours: 24, on_sla_breach: "remind" }],
    fallback_approver: null,
    terminal_on_exhausted_escalation: "hold_and_alert",
    updated_at: "2026-09-30T00:00:00.000Z",
    ...extra,
});
const DAFTAR = [
    aturan(2, "PENGADAAN_BARANG", 10),
    aturan(5, "RESERVASI_RUANGAN", 50, { status_aktif: false }),
    aturan(9, "PENGADAAN_BARANG", 90, {
        versi: 3,
        kondisi: { operator: "AND", conditions: [{ field: "total_value", op: "gte", value: 5_000_000 }, { operator: "OR", conditions: [{ field: "priority", op: "eq", value: "MENDESAK" }] }] },
        steps: [{ order: 1, approver_type: "user", approver_user_id: 44, sla_hours: 8, on_sla_breach: "escalate", escalate_to_user_id: 45 }],
        fallback_approver: { approver_type: "role", approver_role: "R-01" },
    }),
];
const HASIL_PRATINJAU = {
    terpilih: { rule_id: null, draf: true, bawaan: false, prioritas: 10, versi: null },
    cocok: [
        { rule_id: null, draf: true, prioritas: 10 },
        { rule_id: 2, draf: false, prioritas: 10 },
    ],
    langkah: [
        { urutan: 1, approver: { tipe: "role", role: { kode: "R-03", nama: "Kepala Sekolah" }, user: null }, sla_jam: 24, on_sla_breach: "remind", eskalasi_ke: null, fallback: false, akan_dilewati: "konflik kepentingan" },
        { urutan: 2, approver: { tipe: "role", role: { kode: "R-01", nama: "Administrator" }, user: null }, sla_jam: 24, on_sla_breach: "remind", eskalasi_ke: null, fallback: true, akan_dilewati: null },
    ],
};

let log: Permintaan[] = [];
function server(izin: Record<string, string> = IZIN_ADMIN, rute: (p: Permintaan) => Jawaban | undefined = () => undefined) {
    log = pasangServer((p) => {
        const j = rute(p);
        if (j !== undefined) return j;
        if (p.url === "/me") return sukses({ ...ME_ADMIN, permissions: izin });
        if (p.url === "/approval-rules" && p.method === "GET") return sukses(DAFTAR);
        if (p.url === "/roles") return sukses(ROLES);
        if (p.url === "/users/44") return sukses({ id: "44", nama: "Bu Kepala", role_id: "3", status: "NONAKTIF" });
        if (p.url === "/users/45") return sukses({ id: "45", nama: "Pak Wakil", role_id: "3", status: "AKTIF" });
        if (p.url === "/users") return sukses([{ id: "45", nama: "Pak Wakil", role_id: "3", status: "AKTIF" }]);
        return gagal(404, "NOT_FOUND", `Tidak ada: ${p.method} ${p.url}`);
    });
}
const tulis = (method: string) => log.filter((p) => p.method === method && p.url.startsWith("/approval-rules"));

describe("model P-69 ↔ Lampiran D.5", () => {
    it("`{}` ↔ grup akar kosong; predikat tunggal dibungkus grup AND; bolak-balik utuh", () => {
        expect(keDefinisi(modelDari(null)).kondisi).toEqual({});
        expect(keModelKondisi({ field: "item_count", op: "gt", value: 3 })).toMatchObject({ operator: "AND", anak: [{ field: "item_count", op: "gt", value: 3 }] });
        const a = DAFTAR[2] as AturanTersimpan;
        const { jenis_pengajuan, prioritas, kondisi, steps, fallback_approver, terminal_on_exhausted_escalation } = a;
        expect(keDefinisi(modelDari(a))).toEqual({ jenis_pengajuan, prioritas, kondisi, steps, fallback_approver, terminal_on_exhausted_escalation });
    });

    it("pemeriksaan klien menandai jalur yang sama dengan server; model sah → kosong", () => {
        const m = modelDari(null);
        expect(periksaModel(m)).toEqual({ "steps.0.approver_role": "Pilih role approver." });
        expect(periksaModel({ ...m, prioritas: "-1", langkah: [{ ...m.langkah[0]!, approver: { tipe: "role", role: "R-03", user: null }, sla: "0", perilaku: "escalate" }] })).toEqual({
            prioritas: "Prioritas berupa bilangan bulat 0–1.000.000.",
            "steps.0.sla_hours": "SLA berupa bilangan bulat 1–720 jam.",
            "steps.0.escalate_to_user_id": "Pilih pengguna tujuan eskalasi.",
        });
        expect(periksaModel(modelDari(DAFTAR[0] as AturanTersimpan))).toEqual({});
    });

    it("urutan daftar RE-04 per jenis; jumlah syarat menghitung predikat bersarang", () => {
        expect(urutkan(DAFTAR).map((a) => a.id)).toEqual([5, 9, 2]);
        expect(jumlahSyarat(DAFTAR[2]?.kondisi)).toBe(2);
        expect(jumlahSyarat({})).toBe(0);
    });
});

describe("P-68 Approval Rules", () => {
    it("daftar urut RE-04 + aturan bawaan terkunci; sidebar memuat entri; editor tertaut bagi pemegang manage", async () => {
        server();
        await renderAplikasi("/approval-rules");
        const tabel = await screen.findByRole("table");
        const baris = within(tabel).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("rowheader")[0]?.textContent);
        expect(baris).toEqual(["Aturan #5", "Aturan #9", "Aturan #2", "Aturan bawaan"]);
        expect(within(tabel).getByText("Terkunci")).toBeTruthy();
        expect(within(tabel).getByText("Nonaktif")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Aturan #9" }).getAttribute("href")).toBe("/approval-rules/9");
        expect(screen.getByRole("link", { name: "Buat aturan" }).getAttribute("href")).toBe("/approval-rules/baru");
        expect(screen.getByRole("link", { name: /Approval Rules/ })).toBeTruthy();
    });

    it("hanya approval_rule.view: tanpa tombol Buat & tanpa tautan editor; editor langsung → P-08", async () => {
        server({ ...ME_ADMIN.permissions, "approval_rule.view": "all" });
        const { router } = await renderAplikasi("/approval-rules");
        await screen.findByRole("table");
        expect(screen.queryByRole("link", { name: "Buat aturan" })).toBeNull();
        expect(screen.queryByRole("link", { name: "Aturan #9" })).toBeNull();
        await router.navigate({ to: "/approval-rules/$id", params: { id: "baru" } });
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-punya-akses"));
    });

    it("tanpa approval_rule.view → P-08 tanpa memuat daftar; id bukan angka → P-11", async () => {
        server(ME_ADMIN.permissions);
        const { router } = await renderAplikasi("/approval-rules");
        expect(router.state.location.pathname).toBe("/tidak-punya-akses");
        expect(log.some((p) => p.url === "/approval-rules")).toBe(false);
        server();
        await router.navigate({ to: "/approval-rules/$id", params: { id: "abc" } });
        await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-ditemukan"));
    });

    it("id aturan dua digit atau lebih membuka editor; awalan nol & campuran tetap P-11 (regresi regex P-69)", async () => {
        server(IZIN_ADMIN, (p) => (p.url === "/approval-rules" && p.method === "GET" ? sukses([...DAFTAR, aturan(12, "PENGADAAN_BARANG", 70)]) : undefined));
        const { router } = await renderAplikasi("/approval-rules/12");
        expect(router.state.location.pathname).toBe("/approval-rules/12");
        for (const id of ["012", "1d", "12a"]) {
            await router.navigate({ to: "/approval-rules/$id", params: { id } });
            await waitFor(() => expect(router.state.location.pathname).toBe("/tidak-ditemukan"));
        }
    });
});

describe("P-69 Editor Approval Rule", () => {
    it("menyusun aturan multi-level lalu menyimpan body D.5 persis; kembali ke daftar dengan umpan balik (FR-10.1 AC 1)", async () => {
        server(IZIN_ADMIN, (p) => (p.method === "POST" && p.url === "/approval-rules" ? { status: 201, data: { success: true, data: aturan(11, "PENGADAAN_BARANG", 70), meta: null } } : undefined));
        const { router } = await renderAplikasi("/approval-rules/baru");
        await userEvent.selectOptions(await screen.findByLabelText("Jenis pengajuan (wajib)"), "PENGADAAN_BARANG");
        await userEvent.clear(screen.getByLabelText("Prioritas (wajib)"));
        await userEvent.type(screen.getByLabelText("Prioritas (wajib)"), "70");
        await userEvent.click(screen.getByRole("button", { name: "Tambah syarat" }));
        await userEvent.selectOptions(screen.getByLabelText("Field"), "total_value");
        await userEvent.selectOptions(screen.getByLabelText("Operator"), "gte");
        await userEvent.type(screen.getByLabelText("Nilai"), "5000000");
        await userEvent.selectOptions(screen.getByLabelText(/^Role approver/), "R-03");
        await userEvent.click(screen.getByRole("button", { name: "Tambah langkah" }));
        await userEvent.selectOptions(screen.getAllByLabelText(/^Role approver/)[1] as HTMLElement, "R-01");
        await userEvent.selectOptions(screen.getAllByLabelText("Bila SLA terlampaui")[1] as HTMLElement, "escalate");
        await userEvent.selectOptions(screen.getByLabelText("Eskalasi ke: role"), "3");
        await userEvent.selectOptions(await screen.findByLabelText(/^Eskalasi ke: pengguna/), "45");
        await userEvent.click(screen.getByLabelText("Tolak otomatis"));
        await userEvent.click(screen.getByRole("button", { name: "Simpan & aktifkan" }));

        await waitFor(() => expect(router.state.location.pathname).toBe("/approval-rules"));
        expect(tulis("POST").map((p) => p.data)).toEqual([
            {
                jenis_pengajuan: "PENGADAAN_BARANG",
                prioritas: 70,
                kondisi: { operator: "AND", conditions: [{ field: "total_value", op: "gte", value: 5_000_000 }] },
                steps: [
                    { order: 1, approver_type: "role", approver_role: "R-03", sla_hours: 24, on_sla_breach: "remind" },
                    { order: 2, approver_type: "role", approver_role: "R-01", sla_hours: 24, on_sla_breach: "escalate", escalate_to_user_id: 45 },
                ],
                fallback_approver: null,
                terminal_on_exhausted_escalation: "auto_reject",
            },
        ]);
        expect(await screen.findByText(/Approval rule #11 tersimpan/)).toBeTruthy();
    });

    it("hanya field D.2 yang berlaku bagi jenis terpilih ditawarkan (RE-02); grup tingkat 4 tidak ditawarkan (D.1); auto_approve tak pernah ada (BR-039a)", async () => {
        server();
        await renderAplikasi("/approval-rules/baru");
        await userEvent.selectOptions(await screen.findByLabelText("Jenis pengajuan (wajib)"), "RESERVASI_RUANGAN");
        await userEvent.click(screen.getByRole("button", { name: "Tambah syarat" }));
        const opsi = within(screen.getByLabelText("Field")).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
        expect(opsi).toContain("room_type");
        expect(opsi).not.toContain("total_value");
        expect(opsi).not.toContain("disposal_reason");
        // Operator dibatasi tipe (D.3): enum tanpa gt/between.
        await userEvent.selectOptions(screen.getByLabelText("Field"), "room_type");
        expect(within(screen.getByLabelText("Operator")).getAllByRole("option").map((o) => (o as HTMLOptionElement).value)).toEqual(["eq", "neq", "in", "not_in"]);
        // Kedalaman: akar (1) → grup 2 → grup 3; tingkat 3 tidak menawarkan grup baru.
        await userEvent.click(within(screen.getByRole("group", { name: "Kondisi aturan" })).getAllByRole("button", { name: "Tambah grup" }).at(-1) as HTMLElement);
        await userEvent.click(within(screen.getByRole("group", { name: "Grup tingkat 2" })).getByRole("button", { name: "Tambah grup" }));
        expect(screen.getByRole("group", { name: "Grup tingkat 3" })).toBeTruthy();
        expect(within(screen.getByRole("group", { name: "Grup tingkat 3" })).queryByRole("button", { name: "Tambah grup" })).toBeNull();
        expect(screen.queryByText(/otomatis disetujui|auto_approve|Setujui otomatis/i)).toBeNull();
        expect(screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).labels?.[0]?.textContent)).not.toContain("Setujui otomatis");
    });

    it("422 INVALID_RULE_DEFINITION tampil PADA node bermasalah + ringkasan (RE-08); galat struktur ditangkap klien tanpa permintaan", async () => {
        server(IZIN_ADMIN, (p) =>
            p.method === "PUT"
                ? { status: 422, data: { success: false, error: { code: "INVALID_RULE_DEFINITION", message: "Definisi kondisi aturan persetujuan tidak valid.", details: [{ field: "kondisi.conditions.1.conditions.0.value", message: "Nilai harus salah satu dari RENDAH, SEDANG, TINGGI, MENDESAK." }] }, request_id: "r1" } }
                : undefined,
        );
        await renderAplikasi("/approval-rules/9");
        await userEvent.click(await screen.findByRole("button", { name: "Simpan perubahan" }));
        const node = await waitFor(() => {
            const el = document.querySelector('[data-jalur="kondisi.conditions.1.conditions.0"]');
            if (el === null) throw new Error("node belum ada");
            return el as HTMLElement;
        });
        await waitFor(() => expect(within(node).getByText(/Nilai harus salah satu dari RENDAH/)).toBeTruthy());
        expect(screen.getByText(/1 isian perlu diperbaiki/)).toBeTruthy();
        expect(tulis("PUT")).toHaveLength(1);
        expect(tulis("PUT")[0]?.url).toBe("/approval-rules/9");

        // Langkah tanpa approver → ditahan klien; tidak ada permintaan kedua.
        await userEvent.click(screen.getByRole("button", { name: "Tambah langkah" }));
        await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
        const langkah2 = document.querySelector('[data-jalur="steps.1"]') as HTMLElement;
        expect(within(langkah2).getByText("Pilih role approver.")).toBeTruthy();
        expect(tulis("PUT")).toHaveLength(1);
    });

    it("mengubah aturan tersimpan: pemilih pengguna memuat role pengguna itu; approver nonaktif ditandai di Pratinjau (RE-13)", async () => {
        server();
        await renderAplikasi("/approval-rules/9");
        await waitFor(() => expect((screen.getByLabelText("Approver: role") as HTMLSelectElement).value).toBe("3"));
        expect((screen.getByLabelText(/^Approver: pengguna/) as HTMLSelectElement).value).toBe("44");
        expect(screen.getByRole("option", { name: "Bu Kepala (nonaktif)" })).toBeTruthy();
        const panel = screen.getByRole("complementary", { name: "Pratinjau aturan" });
        await waitFor(() => expect(within(panel).getByText(/Bu Kepala — langkahnya akan dilewati/)).toBeTruthy());
        expect(within(panel).queryByText(/Pak Wakil — /)).toBeNull();
        expect((screen.getAllByLabelText("Role approver").at(-1) as HTMLSelectElement).value).toBe("R-01");
    });

    it("pratinjau mengirim draf + skenario, menampilkan aturan terpilih, seluruh yang cocok, dan langkah + alasan dilewati (RE-07, FR-10.1 AC 3)", async () => {
        server(IZIN_ADMIN, (p) => (p.url === "/approval-rules/preview" ? sukses(HASIL_PRATINJAU) : undefined));
        await renderAplikasi("/approval-rules/baru");
        await userEvent.selectOptions(await screen.findByLabelText("Jenis pengajuan (wajib)"), "PENGADAAN_BARANG");
        await userEvent.selectOptions(screen.getByLabelText(/^Role approver/), "R-03");
        const panel = screen.getByRole("complementary", { name: "Pratinjau aturan" });
        await userEvent.type(within(panel).getByLabelText(/^ID pengguna pemohon/), "12");
        await userEvent.type(within(panel).getByLabelText("Total nilai (Rp)"), "7500000");
        await userEvent.selectOptions(within(panel).getByLabelText("Prioritas usulan"), "TINGGI");
        await userEvent.click(within(panel).getByRole("button", { name: "Jalankan pratinjau" }));

        // Muncul dua kali: aturan terpilih dan butir pertama daftar yang cocok.
        expect(await within(panel).findAllByText("Aturan yang sedang disusun ini · prioritas 10")).toHaveLength(2);
        const kirim = log.find((p) => p.url === "/approval-rules/preview");
        expect(kirim?.data).toMatchObject({
            jenis_pengajuan: "PENGADAAN_BARANG",
            pemohon_id: 12,
            fakta: { total_value: 7_500_000, priority: "TINGGI", requester_id: 12 },
            aturan_draf: { jenis_pengajuan: "PENGADAAN_BARANG", kondisi: {}, steps: [{ approver_role: "R-03" }] },
        });
        expect((kirim?.data as { aturan_draf: object }).aturan_draf).not.toHaveProperty("id");
        expect(within(panel).getByText("Aturan #2 · prioritas 10")).toBeTruthy();
        expect(within(panel).getByText("Dilewati — konflik kepentingan")).toBeTruthy();
        expect(within(panel).getByText("Approver cadangan (RE-11)")).toBeTruthy();
        expect(tulis("POST").filter((p) => p.url === "/approval-rules")).toHaveLength(0);

        await userEvent.clear(screen.getByLabelText("Prioritas (wajib)"));
        await userEvent.type(screen.getByLabelText("Prioritas (wajib)"), "99");
        expect(within(panel).getByText(/telah berubah sejak pratinjau ini/)).toBeTruthy();
    });

    it("menonaktifkan wajib beralasan (UX-04) dan memperingatkan snapshot berjalan (FR-10.1 A4)", async () => {
        server(IZIN_ADMIN, (p) => (p.method === "PATCH" ? sukses({ ...DAFTAR[0], status_aktif: false }) : undefined));
        await renderAplikasi("/approval-rules/2");
        await userEvent.click(await screen.findByRole("button", { name: "Nonaktifkan aturan" }));
        const dialog = await screen.findByRole("dialog", { name: "Nonaktifkan approval rule #2?" });
        expect(within(dialog).getByText(/tetap memakai snapshot aturan lama/)).toBeTruthy();
        const tombol = within(dialog).getByRole("button", { name: "Nonaktifkan aturan" });
        expect((tombol as HTMLButtonElement).disabled).toBe(true);
        await userEvent.type(within(dialog).getByLabelText(/^Alasan menonaktifkan/), "Digantikan aturan per nilai");
        await userEvent.click(tombol);
        await waitFor(() => expect(tulis("PATCH").map((p) => [p.url, p.data])).toEqual([["/approval-rules/2/status", { status_aktif: false, alasan: "Digantikan aturan per nilai" }]]));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("Batal dengan perubahan belum tersimpan meminta konfirmasi; tanpa perubahan langsung kembali", async () => {
        server();
        const { router } = await renderAplikasi("/approval-rules/2");
        await userEvent.click(await screen.findByRole("button", { name: "Batal" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/approval-rules"));
        await router.navigate({ to: "/approval-rules/$id", params: { id: "2" } });
        await userEvent.type(await screen.findByLabelText("Prioritas (wajib)"), "5");
        await userEvent.click(screen.getByRole("button", { name: "Batal" }));
        const dialog = await screen.findByRole("dialog", { name: "Buang perubahan aturan?" });
        expect(router.state.location.pathname).toBe("/approval-rules/2");
        await userEvent.click(within(dialog).getByRole("button", { name: "Buang perubahan" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/approval-rules"));
    });

    it("tanpa pelanggaran aksesibilitas axe (WCAG 2.1 AA)", async () => {
        server();
        const { container } = await renderAplikasi("/approval-rules/9");
        await waitFor(() => expect((screen.getByLabelText("Approver: role") as HTMLSelectElement).value).toBe("3"));
        expect(await pelanggaranAxe(container)).toEqual([]);
    }, 30_000);
});
