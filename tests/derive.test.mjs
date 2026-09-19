import test from 'node:test';
import assert from 'node:assert/strict';
import { core, record } from './fixtures/helpers.mjs';

const context = { deviceId:'device_A', consent:'granted', nonce:()=>'AQIDBAUGBwgJCgsMDQ4PEA' };

test('U06 reported executor and endedAt derive one use event after the declaration', () => {
  const declaration = record();
  const result = core.deriveUsageEvent(declaration, context);
  assert.equal(result.skipped, null);
  assert.equal(result.event.hanaRef, 'fixture-native');
  assert.equal(result.event.action, 'use');
  assert.equal(result.event.occurredAt, new Date(1100).toISOString());
  assert.equal(result.event.evidenceRef, declaration.eventRef);
});

test('U06 unavailable executor is skipped instead of guessed', () => {
  const declaration = record();
  declaration.executor.id = { state:'unavailable', value:null, reason:'binding_unavailable' };
  const result = core.deriveUsageEvent(declaration, context);
  assert.equal(result.event, null);
  assert.equal(result.skipped, 'executorUnavailable');
  declaration.executor.id = { state:'estimated', value:'guessed-executor', source:'synthetic.fixture', rule:'guess' };
  assert.equal(core.deriveUsageEvent(declaration, context).skipped, 'executorUnavailable');
});

test('U06 endedAt falls back to startedAt, while both unavailable skip', () => {
  const declaration = record();
  declaration.time.endedAt = { state:'unavailable', value:null, reason:'not_provided' };
  assert.equal(core.deriveUsageEvent(declaration, context).event.occurredAt, new Date(1000).toISOString());
  declaration.time.startedAt = { state:'unavailable', value:null, reason:'not_provided' };
  const result = core.deriveUsageEvent(declaration, context);
  assert.equal(result.event, null);
  assert.equal(result.skipped, 'timeUnavailable');
});

test('U06 withheld consent and absent device create no event', () => {
  assert.equal(core.deriveUsageEvent(record(), { ...context, consent:'withheld' }).skipped, 'consentWithheld');
  assert.equal(core.deriveUsageEvent(record(), { ...context, deviceId:null }).skipped, 'noDevice');
});
