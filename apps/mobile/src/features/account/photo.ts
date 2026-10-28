import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import * as Crypto from "expo-crypto";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { PROFILE_PHOTO_MAX } from "./model";

/** Foto profil: dirender ulang ke JPEG (EXIF dibuang, MOB-MED-02), sisi terpanjang 1024 px, maks 2 MB. */
export async function prepareProfilePhoto(uri: string) {
    const original = await ImageManipulator.manipulate(uri).renderAsync();
    const factor = Math.min(1, 1024 / Math.max(original.width, original.height));
    const image = await ImageManipulator.manipulate(uri).resize({ width: Math.max(1, Math.round(original.width * factor)), height: Math.max(1, Math.round(original.height * factor)) }).renderAsync();
    const file = new File((await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 })).uri);
    if (file.size === 0 || file.size > PROFILE_PHOTO_MAX) { file.delete(); throw new Error("Foto terlalu besar. Pilih foto lain."); }
    const checksum = [...new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes()))].map((b) => b.toString(16).padStart(2, "0")).join("");
    return {
        uri: file.uri, size: file.size, checksum,
        put: async (url: string) => (await fetch(url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: file })).ok,
        discard: () => { if (file.exists) file.delete(); },
    };
}
