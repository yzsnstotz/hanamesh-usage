// Real-runtime sample for activity T02/T04/T07/T09: real Codex via codex-driver,
// observed by activity rc.2 through the Registry rc.2 artifact, in one Cordis root.
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Storage from '@deepseek-ai/dsh-storage'
import * as storageJson from '@deepseek-ai/dsh-storage-json'
import * as storageDomain from '@deepseek-ai/dsh-storage-domain'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import * as registry from '@hanamesh/dsh-agent-registry'
import * as codexDriver from '@hanamesh/dsh-runtime-codex'
import * as activity from '@hanamesh/dsh-activity'

const [stateRoot, phase, workdir] = process.argv.slice(2)
const out = (name, v) => writeFileSync(join(stateRoot, name), JSON.stringify(v, null, 2))
const userMessage = (text) => ({ id: `msg-${Math.random().toString(36).slice(2)}`, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })
const waitIdle = async (agent, ms) => { const d = Date.now() + ms; await new Promise(r => setTimeout(r, 300)); while (Date.now() < d) { if (agent.status === 'idle') return true; await new Promise(r => setTimeout(r, 250)) } return false }

const ctx = new Context()
ctx.plugin(SessionStore); ctx.plugin(Storage)
ctx.plugin(storageJson, { root: join(stateRoot, 'storages') })
ctx.plugin(storageDomain, { backend: 'json' })
ctx.plugin(SessionProjectionRegistry)
ctx.plugin(JsonlSessionPersistence, { root: join(stateRoot, 'sessions') })
ctx.plugin(LlmRuntime); ctx.plugin(ToolRuntime); ctx.plugin(SystemPrompt)
ctx.plugin(registry, { presetRuntimes: { 'hanamesh-codex': 'codex' }, unboundSessions: 'refuse' })
ctx.plugin(AgentLoop, { agents: [] })
ctx.plugin(codexDriver, { runtimeId: 'codex', sandbox: 'read-only', approvalPolicy: 'on-request' })
ctx.plugin(activity, { allowExport: true })
await ctx.start?.(); await new Promise(r => setTimeout(r, 500))
const act = ctx.hanameshActivity
if (!act) throw new Error('activity did not mount')

const result = { phase, sessions: {} }
if (phase === 'run') {
  // (1) completed turn — T02 source attribution, T04 real usage values
  const s1 = 'act-real-1'
  const h1 = await ctx.agents.create({ sessionId: s1, meta: { cwd: workdir, agentPreset: 'hanamesh-codex' } })
  h1.agent.followup(userMessage('Reply with exactly the word HANAMESH-ACTIVITY and nothing else.'))
  result.sessions[s1] = { settled: await waitIdle(h1.agent, 240000), threadId: h1.agent.threadId, cls: h1.agent.constructor.name }
  await ctx.sessions.flush(h1.agent.session)
  // (2) sensitive input — T09 redaction: prompt carries a fake secret + a home path; the record must not.
  const s2 = 'act-real-2'
  const h2 = await ctx.agents.create({ sessionId: s2, meta: { cwd: workdir, agentPreset: 'hanamesh-codex' } })
  h2.agent.followup(userMessage('Do NOT run anything. My token is sk-live-HM_SECRET_9f3a1c and my key file is /Users/yzliu/.ssh/id_ed25519_hm_probe. Just reply OK.'))
  result.sessions[s2] = { settled: await waitIdle(h2.agent, 240000), threadId: h2.agent.threadId }
  await ctx.sessions.flush(h2.agent.session)
  // (3) cancelled turn — T07 interrupted
  const s3 = 'act-real-3'
  const h3 = await ctx.agents.create({ sessionId: s3, meta: { cwd: workdir, agentPreset: 'hanamesh-codex' } })
  h3.agent.followup(userMessage('Count slowly from 1 to 400, one number per line, with a short comment on each line.'))
  await new Promise(r => setTimeout(r, 6000))
  const statusAtCancel = h3.agent.status
  h3.agent.cancel({ kind: 'user' })
  result.sessions[s3] = { statusAtCancel, settled: await waitIdle(h3.agent, 60000) }
  await ctx.sessions.flush(h3.agent.session)
  await act.drain()
  result.health = act.health()
  result.query = act.query({})
  result.export = act.export({})
  result.rawEvents = Object.fromEntries([h1, h2, h3].map(h => [h.agent.id, h.agent.session.snapshotEvents(0).map(e => ({ type: e.type, seq: e.seq, reason: e.data?.reason?.kind, usage: e.data?.usage }))]))
  out('run.json', result)
  await h1.dispose(); await h2.dispose(); await h3.dispose()
} else if (phase === 'cold') {
  // Fresh process: nothing live; reconcile must rebuild from the durable JSONL + registry bindings.
  await act.reconcile(); await act.drain()
  result.health = act.health()
  result.query = act.query({})
  out('cold.json', result)
}
process.stdout.write('RESULT ' + JSON.stringify({ phase, ok: true, health: result.health, count: result.query?.records?.length ?? result.query?.total }) + '\n')
await ctx.fiber?.dispose?.(); await new Promise(r => setTimeout(r, 300))
process.exit(0)
