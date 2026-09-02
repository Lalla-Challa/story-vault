/**
 * Shared runtime constants.
 */

/** Sent to the client whenever the vault is locked / not authenticated. */
export const LOCKED_ERR_MSG = "Vault is locked (10001)";
/** Alias used by the client to detect auth failures and redirect to /login. */
export const UNAUTHED_ERR_MSG = LOCKED_ERR_MSG;
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

/** openId of the single local user in the local-first app. */
export const LOCAL_USER_OPEN_ID = "local:primary";