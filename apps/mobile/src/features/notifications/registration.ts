/** FID backend, bukan token APNs atau Expo Push. Tidak ada antrean/persistensi operasional. */
export interface DevicePort {
    identity(): Promise<string | null>;
    register(fid: string, signal: AbortSignal): Promise<void>;
    unregister(fid: string): Promise<void>;
    revokeNative(): Promise<void>;
}
export class DeviceRegistration {
    private generation = 0;
    private abort: AbortController | null = null;
    private fid: string | null = null;
    constructor(private readonly port: DevicePort) {}
    async start(): Promise<boolean> {
        const generation = ++this.generation; this.abort?.abort(); const abort = new AbortController(); this.abort = abort;
        const fid = await this.port.identity();
        if (!fid || generation !== this.generation) return false;
        this.fid = fid;
        await this.port.register(fid, abort.signal);
        return generation === this.generation;
    }
    stop() { this.generation++; this.abort?.abort(); this.abort = null; }
    async logout(): Promise<void> {
        this.stop(); const fid = this.fid; this.fid = null;
        try { if (fid) await this.port.unregister(fid); } finally { await this.port.revokeNative(); }
    }
}
