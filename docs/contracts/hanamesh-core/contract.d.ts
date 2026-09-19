export type ConsentState = 'granted' | 'withheld';
export interface SessionSnapshot {
  readonly protocolVersion: '1';
  readonly deviceId: string;
  readonly registration: 'unregistered' | 'registered' | 'failed';
  readonly principalId: string | null;
  readonly bound: boolean | null;
  readonly serverReachable: boolean | null;
  readonly checkedAt: string | null;
  readonly reason: string | null;
}
export interface HealthSnapshot {
  readonly revision: number;
  readonly mode: 'normal' | 'restricted' | 'blocked' | 'repair';
  readonly components: readonly unknown[];
  readonly fault?: string;
}
export interface RequestSignatureInput {
  readonly method: string;
  readonly path: string;
  readonly body: Uint8Array | null;
}
export type DeviceAuthHeaders = Record<'x-hm-device-id' | 'x-hm-timestamp' | 'x-hm-nonce' | 'x-hm-signature', string>;
export interface HanaMeshCoreContract {
  readonly protocolVersion: '1';
  getDeviceId(): string;
  getPublicKey(): string;
  sign(bytes: Uint8Array): Uint8Array;
  signRequest(input: RequestSignatureInput): Promise<DeviceAuthHeaders>;
  getConsent(): ConsentState;
  onConsentChange(listener: (state: ConsentState, changedAt: string) => void): () => void;
  getSession(): SessionSnapshot;
  getServerOrigin(): string | null;
  getHealth(): HealthSnapshot;
}
