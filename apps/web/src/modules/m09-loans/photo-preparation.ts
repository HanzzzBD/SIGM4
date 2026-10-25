// C-29: foto kondisi dikompresi otomatis; tanda tangan PNG dipertahankan utuh.
export async function preparePhoto(file: File): Promise<File> {
    if (!["image/jpeg", "image/png"].includes(file.type)) throw new Error("Foto harus JPG atau PNG.");
    const image = await createImageBitmap(file);
    try {
        const scale = Math.min(1, 1600 / Math.max(image.width, image.height)), canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d"); if (!context) throw new Error("Foto tidak dapat diproses pada peramban ini.");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const encoded = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.8));
        if (!encoded || encoded.size > 2 * 1024 * 1024) throw new Error("Foto setelah kompresi melebihi 2 MB. Pilih foto yang lebih kecil.");
        return new File([encoded], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    } finally { image.close(); }
}
