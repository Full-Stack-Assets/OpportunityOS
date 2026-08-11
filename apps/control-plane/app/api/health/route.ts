export function GET() {
  return Response.json({
    service: 'opportunityos-control-plane',
    version: '0.1.0-simulation',
    executionMode: process.env.OPPORTUNITYOS_EXECUTION_MODE ?? 'simulation',
    postgresConfigured: Boolean(process.env.DATABASE_URL),
    buildGraphConfigured: Boolean(process.env.BUILDGRAPH_BASE_URL),
  });
}
