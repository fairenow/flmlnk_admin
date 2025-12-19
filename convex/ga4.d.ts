/**
 * Type declarations for @google-analytics/data module.
 * This is an optional dependency used for GA4 analytics import.
 */
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
