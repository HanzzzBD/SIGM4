/** PR-02-51: pemisah dari header logis pertama; kutipan dan baris data tidak ikut dihitung. */
export function detectCsvDelimiter(buffer: Buffer): "," | ";" {
    const text = buffer.toString("utf8");
    let quoted = false, commas = 0, semicolons = 0;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (char === '"') {
            if (quoted && text[i + 1] === '"') i += 1;
            else quoted = !quoted;
        } else if (!quoted) {
            if (char === "\r" || char === "\n") break;
            if (char === ",") commas += 1;
            if (char === ";") semicolons += 1;
        }
    }
    // CSV lama dan header satu kolom tetap memakai koma.
    return semicolons > commas ? ";" : ",";
}
