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
interface PageSource {
    entryId: string;
    moduleName: string;
    surface: string;
}
type IssueResult = {
    disposition: string;
    credential?: string;
};
interface PagesRemote {
    issue(request: PageSource): Promise<{
        ok: true;
        value: IssueResult;
    } | {
        ok: false;
        error: unknown;
    }>;
    presented(request: {
        credential: string;
    }): Promise<unknown>;
}
interface ClientContext {
    slots: SettingsSlots;
    remote: {
        $mount(contribution: import('@deepseek-ai/dsh-typert-protocol').TypertRemoteContribution): Promise<() => void>;
        hanameshUsagePages: PagesRemote;
    };
    on(name: 'internal/get', listener: (caller: unknown, name: string, error: unknown, next: () => unknown) => unknown): () => void;
    effect(fn: () => unknown): unknown;
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
export declare const pagesContribution: import('@deepseek-ai/dsh-typert-protocol').TypertRemoteContribution;
/** Install before awaiting Remote mounting, so concurrent slot registrations are captured. */
export declare function apply(ctx: ClientContext): Promise<void>;
export {};
