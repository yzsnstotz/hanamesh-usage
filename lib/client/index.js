import { createElement as h, useEffect, useState } from 'react';
export const inject = ['slots'];
/** Same authenticated Fetch registry for Web and the Desktop carrier. No write API. */
export async function fetchUsagePanel(signal) {
    const carrier = window.__DSH_TRANSPORT__;
    const init = { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal };
    const response = carrier?.fetch
        ? await carrier.fetch('api/hanamesh/usage/panel/view', init)
        : await globalThis.fetch('api/hanamesh/usage/panel/view', init);
    if (!response.ok || !response.headers.get('content-type')?.startsWith('text/html'))
        throw new Error('USAGE_PANEL_UNAVAILABLE');
    return await response.text();
}
/** A sandboxed, script-free Usage-owned view with explicit refresh/error states. */
export function UsagePanel() {
    const [revision, setRevision] = useState(0);
    const [state, setState] = useState({ loading: true, html: null, error: false });
    useEffect(() => {
        const controller = new AbortController();
        setState({ loading: true, html: null, error: false });
        void fetchUsagePanel(controller.signal).then(html => {
            if (!controller.signal.aborted)
                setState({ loading: false, html, error: false });
        }, () => {
            if (!controller.signal.aborted)
                setState({ loading: false, html: null, error: true });
        });
        return () => controller.abort();
    }, [revision]);
    return h('section', { 'aria-label': 'Usage 开发小面板' }, h('h2', null, 'Usage 开发小面板'), h('button', { type: 'button', disabled: state.loading, onClick: () => setRevision(value => value + 1) }, state.loading ? '读取中…' : '刷新本机记录'), state.error ? h('p', { role: 'alert' }, '本机记录读取失败 · USAGE_PANEL_UNAVAILABLE；没有新采集或上报。') : null, state.html === null ? null : h('iframe', { title: '本机 Usage 事件、签名与上报状态', srcDoc: state.html, sandbox: '', style: { width: '100%', height: 650, border: 0 } }));
}
/** Feature contributes its own page; the platform owns navigation and rendering. */
export function apply(ctx) {
    ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'hanamesh-usage', order: 80, label: 'Usage 开发小面板' }, UsagePanel));
}
