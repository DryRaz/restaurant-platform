import { NextRequest, NextResponse } from "next/server";

/**
 * Resolves which restaurant a request belongs to and rewrites it onto
  * the /[tenant]/... route tree, which is what every page under
   * app/[tenant]/ actually reads its `tenant` param from.
    *
     * Two ways in, both supported at once so the platform works before
      * wildcard DNS is configured:
       *   1. Subdomain (production, once wildcard DNS + Vercel domain are set
        *      up): bella-vista.orderbase.app/menu -> /bella-vista/menu
         *   2. Path prefix (works immediately, no DNS needed -- useful for
          *      local dev and for demoing a tenant before its subdomain is live):
           *      orderbase.app/bella-vista/menu -> passes through unchanged,
            *      since it already matches the [tenant] route.
             *
              * API routes (/api/*) and static assets are left untouched -- they
               * resolve their restaurant from the request body/query instead.
                */
                export function middleware(request: NextRequest) {
                  const { pathname } = request.nextUrl;

                    if (
                        pathname.startsWith("/api") ||
                            pathname.startsWith("/_next") ||
                                pathname === "/favicon.ico"
                                  ) {
                                      return NextResponse.next();
                                        }

                                          const host = request.headers.get("host") || "";
                                            const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || "";
                                              const hostWithoutPort = host.split(":")[0];

                                                const isSubdomainRequest =
                                                    baseDomain &&
                                                        hostWithoutPort.endsWith(`.${baseDomain}`) &&
                                                            hostWithoutPort !== baseDomain &&
                                                                hostWithoutPort !== `www.${baseDomain}`;

                                                                  if (isSubdomainRequest) {
                                                                      const slug = hostWithoutPort.replace(`.${baseDomain}`, "");
                                                                          const url = request.nextUrl.clone();
                                                                              url.pathname = `/${slug}${pathname}`;
                                                                                  return NextResponse.rewrite(url);
                                                                                    }

                                                                                      // Path-based: /[tenant]/... already matches the route tree as-is.
                                                                                        return NextResponse.next();
                                                                                        }

                                                                                        export const config = {
                                                                                          matcher: ["/((?!_next/static|_next/image).*)"],
                                                                                          };
