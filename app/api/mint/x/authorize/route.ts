import {NextRequest, NextResponse} from "next/server";
import {beginXOAuth, getXOAuthConfig, XOAuthConfigError} from "../../../../../lib/x-oauth";

export const dynamic = "force-dynamic";

/** Start an X OAuth flow for a wallet: validate the address, then redirect to X. */
export async function GET(request: NextRequest) {
  try {
    const wallet = request.nextUrl.searchParams.get("wallet");
    if (!wallet) {
      return NextResponse.json({ok: false, error: "Missing wallet address."}, {status: 400});
    }
    const {authorizeUrl} = beginXOAuth({wallet, config: getXOAuthConfig()});
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    if (error instanceof XOAuthConfigError) {
      return NextResponse.json(
        {ok: false, error: "X connection is not configured on this server."},
        {status: 500}
      );
    }
    return NextResponse.json(
      {ok: false, error: error instanceof Error ? error.message : "Could not start the X connection."},
      {status: 400}
    );
  }
}
