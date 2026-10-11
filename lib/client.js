window.__ModuleLoader__.load({id:'hanamesh-usage',factory:(require)=>{const module={exports:{}};const exports=module.exports;
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pagesContribution = exports.inject = void 0;
exports.fetchUsagePanel = fetchUsagePanel;
exports.UsagePanel = UsagePanel;
exports.apply = apply;
const react_1 = require("react");
exports.inject = ['slots', 'remote'];
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
/** Usage-owned strict wire codecs implement Typert's documented schema parse seat. */
function requestCodec(method) {
    return { mode: 'strict', typeSymbol: `hanamesh-usage/${method}Request`, create: () => ({ parse(value) {
                if (!value || typeof value !== 'object' || Array.isArray(value))
                    throw new Error('USAGE_PAGE_INVALID_REQUEST');
                const item = value;
                if (method === 'issue') {
                    if (Object.keys(item).sort().join('|') !== 'entryId|moduleName|surface' || typeof item.entryId !== 'string' || typeof item.moduleName !== 'string'
                        || !['main', 'settings.section', 'plugins.bundle.config', 'plugins.row.config'].includes(item.surface))
                        throw new Error('USAGE_PAGE_INVALID_REQUEST');
                    return { entryId: item.entryId, moduleName: item.moduleName, surface: item.surface };
                }
                if (Object.keys(item).join('|') !== 'credential' || typeof item.credential !== 'string')
                    throw new Error('USAGE_PAGE_INVALID_REQUEST');
                return { credential: item.credential };
            } }) };
}
exports.pagesContribution = {
    package: 'hanamesh-usage', descriptors: ['issue', 'presented'].map(method => ({
        id: `hanamesh-usage#hanameshUsagePages/${method}`, service: 'hanameshUsagePages', namespace: 'hanameshUsagePages', method,
        invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: requestCodec(method) }], result: { mode: 'src-json' },
    })),
};
function slotOwner(caller) {
    const seen = new Set();
    for (let fiber = caller?.fiber; fiber && !seen.has(fiber); fiber = fiber.parent?.fiber) {
        seen.add(fiber);
        const entry = fiber.entry;
        if (!entry)
            continue;
        if (typeof entry.id !== 'string' || typeof entry.options?.name !== 'string' || entry.options.group)
            return null;
        return { entryId: entry.id, moduleName: entry.options.name };
    }
    return null;
}
/** Observe committed DOM, preserving component props and framework-owned registration. */
function presentedPage(component, source, remote, enabled) {
    return function UsagePresentedPage(props) {
        const element = (0, react_1.useRef)(null);
        const claim = (0, react_1.useRef)(null);
        const sent = (0, react_1.useRef)(false);
        (0, react_1.useEffect)(() => {
            let mounted = true;
            const observer = new MutationObserver(check);
            function check() {
                if (!mounted || !enabled() || sent.current || !element.current?.childNodes.length)
                    return;
                claim.current ??= remote().issue(source).then(result => result.ok ? result.value : null, () => null);
                void claim.current.then(result => {
                    if (!mounted || !enabled() || sent.current || result?.disposition !== 'issued' || typeof result.credential !== 'string')
                        return;
                    sent.current = true;
                    observer.disconnect();
                    void remote().presented({ credential: result.credential }).catch(() => { });
                });
            }
            if (element.current)
                observer.observe(element.current, { childList: true, subtree: true });
            check();
            return () => { mounted = false; observer.disconnect(); };
        });
        return (0, react_1.createElement)('div', { ref: element, style: { display: 'contents' } }, (0, react_1.createElement)(component, props));
    };
}
/** Install before awaiting Remote mounting, so concurrent slot registrations are captured. */
async function apply(ctx) {
    let closed = false;
    let pagesContext = null;
    const stop = ctx.on('internal/get', (caller, name, _error, next) => {
        const service = next();
        if (closed || name !== 'slots' || !service || typeof service.register !== 'function')
            return service;
        return new Proxy(service, { get(target, key) {
                const member = Reflect.get(target, key, target);
                if (key !== 'register' || typeof member !== 'function')
                    return typeof member === 'function' ? member.bind(target) : member;
                return (options, component) => {
                    const owner = slotOwner(caller);
                    const body = !closed && owner && ['main', 'settings.section', 'plugins.bundle.config', 'plugins.row.config'].includes(options?.name ?? '')
                        ? presentedPage(component, { ...owner, surface: options.name }, () => pagesContext.remote.hanameshUsagePages, () => !closed && pagesContext !== null) : component;
                    return Reflect.apply(member, target, [options, body]);
                };
            } });
    });
    ctx.effect(() => () => { closed = true; stop(); });
    try {
        await ctx.effect(async () => await ctx.remote.$mount(exports.pagesContribution));
    }
    catch (error) {
        closed = true;
        stop();
        throw error;
    }
    if (closed)
        return;
    // $mount creates the namespace. Declare its dependency in a child fiber only
    // afterwards; accessing it through the outer remote inject is prohibited.
    await ctx.inject(['remote.hanameshUsagePages', 'slots'], scoped => {
        pagesContext = scoped;
        scoped.effect(() => () => { if (pagesContext === scoped)
            pagesContext = null; });
        scoped.slots.inject('settings.section', () => scoped.slots.register({ name: 'settings.section', id: 'hanamesh-usage', order: 80, label: 'Usage 开发小面板' }, UsagePanel));
    });
}

return module.exports;}});
