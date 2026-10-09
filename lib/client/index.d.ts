/** Public Settings Slot subset used here; mirrors the frozen platform contract. */
interface SettingsSlots {
    inject(name: 'settings.section', mount: () => () => void): unknown;
    register(options: {
        name: 'settings.section';
        id: string;
        order: number;
        label: string;
    }, component: typeof UsagePanel): () => void;
}
interface ClientContext {
    slots: SettingsSlots;
}
interface Carrier {
    fetch?(input: string | URL, init: RequestInit): Promise<Response>;
}
declare global {
    interface Window {
        __DSH_TRANSPORT__?: Carrier;
    }
}
export declare const inject: string[];
/** Same authenticated Fetch registry for Web and the Desktop carrier. No write API. */
export declare function fetchUsagePanel(signal: AbortSignal): Promise<string>;
/** A sandboxed, script-free Usage-owned view with explicit refresh/error states. */
export declare function UsagePanel(): import("react").DetailedReactHTMLElement<{
    'aria-label': string;
}, HTMLElement>;
/** Feature contributes its own page; the platform owns navigation and rendering. */
export declare function apply(ctx: ClientContext): void;
export {};
