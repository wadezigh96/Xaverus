import {NextRequest, NextResponse} from "next/server";
import {completeXOAuth, getXOAuthConfig} from "../../../../../lib/x-oauth";

export const dynamic = "force-dynamic";

/**
 * X OAuth callback: validate the state, exchange the code server-side, read
 * the X user, and record the X Binding against the wallet that started the
 * flow. Always redirects back to /mint with a generic outcome flag; failure
 * details never leak to the browser.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const denied = params.get("error");
  try {
    if (denied) throw new Error(`X authorization failed: ${denied}`);
    if (!code || !state) throw new Error("Missing code or state.");
    await completeXOAuth({code, state, config: getXOAuthConfig()});
    return NextResponse.redirect(new URL("/mint?x=connected", request.nextUrl.origin));
  } catch (error) {
    console.error(
      "X OAuth callback failed:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.redirect(new URL("/mint?x=error", request.nextUrl.origin));
  }
}
