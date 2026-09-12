/**
 * Commit the routing owner BEFORE making a session durable/visible.
 * A failure in `publishAuthority` intentionally leaves the owner orphan.
 * Do not add rollback here: the second medium may have committed before throwing.
 */
export declare function ownerBeforeAuthority<T>(commitOwner: () => Promise<void>, publishAuthority: () => Promise<T>): Promise<T>;
