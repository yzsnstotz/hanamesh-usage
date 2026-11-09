# HanaMesh client pages (CL1)

The existing settings section and new keyed main page render the same Usage-owned component. No new recording, upload, economic or storage protocol is introduced. Filters apply only to the currently returned local page and never synthesize events or write state. The withheld state shows an empty card; upload details and the original explicit resend action remain available under disclosures. Unknown remote counts keep their unavailable state.

The immediate Usage observer still injects only framework services. A child `ctx.inject(['layout'])` scope contributes `main` **key** `hanamesh-usage` and `sidebar.panellist` **id** `hanamesh-usage`, order 12. Layout navigation never changes the Session. The consent button selects Core's public `hanamesh-account` main key; if Core is absent, the page reports that fact and directs the person to Core settings. Losing layout never blocks the original Usage observer or settings section. Slot and feature lifetimes remain Cordis-owned.

Presentation uses scoped CSS consuming host theme tokens; it does not replace the sidebar/root/conversation or set global appearance preferences. The activity glyph is the exact supplied DS1 `design/usage.html` Lucide activity asset. No icon runtime or remote font/image dependency is added. The page reuses the host light/dark palette.

Source tests and hook fixtures do not establish real DSH loading, screenshots or pixel fidelity. Those require the isolated real-host gate recorded in CL1 delivery.
