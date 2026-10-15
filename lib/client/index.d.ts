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
    inject(names: string[], mount: (ctx: ClientContext) => void): PromiseLike<unknown>;
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
declare const verificationCalls: readonly ["record", "health", "observeCollection"];
type VerificationCall = typeof verificationCalls[number];
interface VerificationReply {
    call: VerificationCall;
    input: unknown;
    result: unknown;
    health: unknown;
}
/** Test-profile bridge; forwards the edited input without generating source facts. */
export declare function fetchUsageVerification(call: VerificationCall, input: unknown, signal: AbortSignal): Promise<VerificationReply>;
/** Native controls are outside the script-free view and hidden until enabled. */
export declare function UsageVerificationPanel(): import("react").DetailedReactHTMLElement<{
    'aria-label': string;
}, HTMLElement> | null;
interface WithdrawalSnapshot {
    requestedAt: string;
    deviceId: string;
    state: 'pending' | 'sent' | 'offline' | 'unconfirmed';
    attempts: number;
    deletedEvents: number | null;
    lastError: string | null;
}
/** Client-side copy of the existing public health contract; contains no signing material. */
interface HealthSnapshot {
    pending: number;
    recoveryComplete: boolean;
    failures: Record<string, number>;
    consent: 'granted' | 'withheld' | 'unknown';
    core: 'present' | 'absent' | 'incompatible';
    deviceId: string | null;
    outbox: {
        state: 'idle' | 'uploading' | 'backoff' | 'offline' | 'stopped' | 'unconfirmed';
        pending: number;
        sent: number;
        duplicate: number;
        rejected: number;
        lastUploadAt: string | null;
        nextAttemptAt: string | null;
        lastError: string | null;
    };
    withdrawal: WithdrawalSnapshot | null;
    inventory: {
        available: boolean;
        source: 'plugin-manager' | 'none';
        lastScanAt: string | null;
        lastError: string | null;
        failureKind: string | null;
        unreadable: number;
        detail: {
            package: string;
            serviceKey: string;
            methods: string[];
        } | null;
    };
    filtered: {
        commands: number;
        pages: number;
    };
}
export interface ResendEventsResult {
    readonly state: 'processed' | 'withheld' | 'rejected';
    readonly code: null | 'RESEND_INPUT_INVALID' | 'RESEND_EVENT_UNAVAILABLE' | 'CORE_UNAVAILABLE' | 'USAGE_UNAVAILABLE' | 'UPLOAD_STATE_PERSIST_FAILED' | 'RESEND_FAILED';
    readonly events: readonly {
        eventId: string;
        delivery: 'pending' | 'confirmed' | 'rejected' | 'unconfirmed';
        code: string | null;
    }[];
    readonly health: HealthSnapshot | null;
}
/** One explicit user intent, through the normal authenticated carrier. */
export declare function fetchUsageResend(input: {
    eventIds: string[];
}, signal: AbortSignal): Promise<ResendEventsResult>;
/** Normal Settings controls. Reading this component grants no resend intent. */
export declare function UsageResendPanel({ revision }: {
    revision?: number;
}): import("react").DetailedReactHTMLElement<{
    'aria-label': string;
}, HTMLElement>;
/** Same authenticated Fetch registry for Web and the Desktop carrier. No write API. */
export declare function fetchUsagePanel(signal: AbortSignal): Promise<string>;
/** One record as the person sees it: what, when, and whether the server has it (with the server's reason). */
export interface UsageRecordRow {
    eventId: string;
    hanaRef: string;
    action: 'install' | 'open' | 'use' | 'uninstall';
    occurredAt: string;
    upload: 'pending' | 'sent' | 'duplicate' | 'rejected';
    code: string | null;
}
export interface UsageRecordsSnapshot {
    deviceId: string | null;
    consent: HealthSnapshot['consent'];
    core: HealthSnapshot['core'];
    total: number;
    outbox: {
        state: HealthSnapshot['outbox']['state'];
        pending: number;
        sent: number;
        duplicate: number;
        rejected: number;
        lastUploadAt: string | null;
        nextAttemptAt: string | null;
        lastError: string | null;
    };
    withdrawal: WithdrawalSnapshot | null;
    rows: UsageRecordRow[];
    inventory: {
        lastError: string | null;
        failureKind: string | null;
        unreadable: number;
    } | null;
    filtered: {
        commands: number;
        pages: number;
    } | null;
}
export declare const usageReason: (code: string | null) => string;
/** The person's view of their usage records. Reading never collects, uploads or resends anything. */
export declare function UsageRecords({ revision }: {
    revision?: number;
}): import("react").ReactElement<{
    'data-hanamesh-usage-records': string;
}, string | import("react").JSXElementConstructor<any>>;
/** Settings section: the records first; resend and test-build verification stay under 诊断. */
export declare function UsagePanel(): import("react").DetailedReactHTMLElement<{
    'aria-label': string;
}, HTMLElement>;
export declare const pagesContribution: import('@deepseek-ai/dsh-typert-protocol').TypertRemoteContribution;
/** Install before awaiting Remote mounting, so concurrent slot registrations are captured. */
export declare function apply(ctx: ClientContext): Promise<void>;
export {};
