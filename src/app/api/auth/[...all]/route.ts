import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Better Auth owns every /api/auth/* route: sign-in, the Google callback,
// session lookup, and sign-out.
export const { GET, POST } = toNextJsHandler(auth);
