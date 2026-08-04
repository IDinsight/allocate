import { oAuthProtectedResourceMetadata } from "better-auth/plugins";
import { auth } from "@/lib/auth";

// RFC 9728 protected-resource metadata. The optional catch-all also serves
// the path-suffixed form /.well-known/oauth-protected-resource/api/mcp,
// which Claude probes first when discovering how to authorize against
// /api/mcp. The proxy passes /.well-known/* through unauthenticated.
export const GET = oAuthProtectedResourceMetadata(auth);
