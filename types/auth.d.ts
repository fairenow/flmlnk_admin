declare module "@convex-dev/better-auth" {
  export const convexAuth: any;
  export const auth: any;
}

declare module "@convex-dev/better-auth/server" {
  export const convexAuth: any;
  export const convexAuthNextjsMiddleware: any;
  export const convexAdapter: any;
}

declare module "@convex-dev/better-auth/react" {
  export const ConvexBetterAuthProvider: any;
  export const Authenticated: any;
  export const Unauthenticated: any;
  export const AuthLoading: any;
  export const useConvexAuth: any;
}

declare module "better-auth" {
  export const betterAuth: any;
  export const googleAuth: any;
}

declare module "@google-analytics/data" {
  export class BetaAnalyticsDataClient {
    constructor(options?: { credentials?: Record<string, unknown> });
    runReport(request: {
      property: string;
      dateRanges: Array<{ startDate: string; endDate: string }>;
      dimensions?: Array<{ name: string }>;
      metrics?: Array<{ name: string }>;
    }): Promise<
      [
        {
          rows?: Array<{
            dimensionValues?: Array<{ value?: string }>;
            metricValues?: Array<{ value?: string }>;
          }>;
        }
      ]
    >;
  }
}
