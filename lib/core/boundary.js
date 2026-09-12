/** Safe residual: durable source without a summary. Never a summary with no source. */
export async function commitAfterSource(ensureSourceDurable, commitSummary) {
    await ensureSourceDurable();
    return await commitSummary();
}
