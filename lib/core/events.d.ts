export type Action = 'install' | 'open' | 'use' | 'uninstall';
export type UploadState = 'pending' | 'sent' | 'duplicate' | 'rejected';
/** rc.7 使用回执：应用 × 供应商 × 模型 × 次数；不记内容。只允许挂在 `use` 事件上。 */
export interface UsageReceipt {
    providerId: string;
    model: string | null;
    count: number;
}
export interface UsageEvent {
    schemaVersion: 1;
    eventId: string;
    deviceId: string;
    hanaRef: string;
    action: Action;
    occurredAt: string;
    nonce: string;
    signature: string | null;
    /** rc.7 归因：来源 Hana（npm 包名 / registry id），缺省 null。 */
    sourceHanaRef: string | null;
    /** rc.7 归因：目标应用 / 会话引用（有界 token），缺省 null。 */
    targetRef: string | null;
    /** rc.7 使用回执；rc.6 及更早的本地事件没有这个键，读取时视为 null。 */
    receipt?: UsageReceipt | null;
    source: 'session-log' | 'loader' | 'seat';
    sourcePlugin: string | null;
    evidenceRef: string | null;
    upload: {
        state: UploadState;
        code: string | null;
        attempts: number;
        sentAt: string | null;
    };
}
/** 上线形状：七个必备键，加上仅在非 null 时出现的三个可选归因键（O1 `POST /v1/usage/events`）。 */
export type WireUsageEvent = Pick<UsageEvent, 'deviceId' | 'hanaRef' | 'action' | 'occurredAt' | 'eventId' | 'nonce' | 'signature'> & {
    sourceHanaRef?: string;
    targetRef?: string;
    receipt?: UsageReceipt;
};
export declare function validTargetRef(value: unknown): value is string;
export declare function validReceipt(value: unknown): value is UsageReceipt;
export declare function validateEvent(input: unknown): asserts input is UsageEvent;
export type CreateUsageEventInput = Omit<UsageEvent, 'schemaVersion' | 'sourceHanaRef' | 'targetRef' | 'receipt' | 'upload'> & {
    sourceHanaRef?: string | null;
    targetRef?: string | null;
    receipt?: UsageReceipt | null;
};
export declare function createUsageEvent(input: CreateUsageEventInput): UsageEvent;
/** 只在非 null 时带上三个可选归因键；服务端把它们纳入内容 digest，但不纳入六键签名。 */
export declare function wireEvent(input: UsageEvent): WireUsageEvent;
/** Rebuild every locally exposed field so later private additions cannot leak by spread. */
export declare function exportEventProjection(input: UsageEvent): UsageEvent;
