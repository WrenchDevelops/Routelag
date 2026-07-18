/**
 * Auth helpers — invite tokens and routing entitlement tokens.
 * Entitlement minting/verification lives in ./entitlement; this module
 * re-exports the invite surface used by older call sites.
 */
export {
  createInviteToken as createToken,
  verifyRoutingToken as verifyToken,
  type RoutingTokenClaims as TokenClaims,
} from "./entitlement/token.js";
