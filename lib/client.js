window.__ModuleLoader__.load({id:'hanamesh-usage',factory:(require)=>{const module={exports:{}};const exports=module.exports;
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = void 0;
exports.fetchUsagePanel = fetchUsagePanel;
exports.UsagePanel = UsagePanel;
exports.apply = apply;
const react_1 = require("react");
exports.inject = ['slots'];
/** Same authenticated Fetch registry for Web and the Desktop carrier. No write API. */
async function fetchUsagePanel(signal) {
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
function UsagePanel() {
    const [revision, setRevision] = (0, react_1.useState)(0);
    const [state, setState] = (0, react_1.useState)({ loading: true, html: null, error: false });
    (0, react_1.useEffect)(() => {
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
    return (0, react_1.createElement)('section', { 'aria-label': 'Usage 开发小面板' }, (0, react_1.createElement)('h2', null, 'Usage 开发小面板'), (0, react_1.createElement)('button', { type: 'button', disabled: state.loading, onClick: () => setRevision(value => value + 1) }, state.loading ? '读取中…' : '刷新本机记录'), state.error ? (0, react_1.createElement)('p', { role: 'alert' }, '本机记录读取失败 · USAGE_PANEL_UNAVAILABLE；刷新只读，不触发新的采集或上报。') : null, state.html === null ? null : (0, react_1.createElement)('iframe', { title: '本机 Usage 事件、签名与上报状态', srcDoc: state.html, sandbox: '', style: { width: '100%', height: 650, border: 0 } }));
}
/** Feature contributes its own page; the platform owns navigation and rendering. */
function apply(ctx) {
    ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'hanamesh-usage', order: 80, label: 'Usage 开发小面板' }, UsagePanel));
}

return module.exports;}});
