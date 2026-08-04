import { oAuthDiscoveryMetadata } from "better-auth/plugins";
import { auth } from "@/lib/auth";

// RFC 8414 authorization-server metadata. Better Auth serves the same
// document under /api/auth/.well-known/, but MCP clients resolve the issuer
// (the bare origin) and probe /.well-known/ at the root, so it must exist
// here too. The proxy passes /.well-known/* through unauthenticated.
export const GET = oAuthDiscoveryMetadata(auth);
