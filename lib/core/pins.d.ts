/**
 * Versions this build was composed against. They are RECORDED into each new
 * record's provenance; they are NOT a validation gate on stored records.
 *
 * 2026-09-13: the previous build asserted `registryVersion === '0.1.0-rc.2'`
 * inside the storage-domain schema, so re-pinning to Registry rc.3 made the
 * pinned host refuse to boot on its own rc.2 snapshot ("stored global does not
 * match its schema"). A plugin must never make the host unbootable over its
 * own historical data: older records keep the version they were observed under.
 */
export declare const REGISTRY_VERSION = "0.1.0-rc.3";
export declare const DSH_VERSION = "0.1.5-alpha.1";
