const stages = [
  ['Discover', 'Opportunity and platform registry'],
  ['Rank', 'Capability fit, evidence quality, economics, urgency'],
  ['Preflight', 'BuildGraph reuse/duplicate-work gate'],
  ['Govern', 'Trust Kernel and Needs You decisions'],
  ['Compile', 'Requirements DAG and factory selection'],
  ['Execute', 'Simulation-only isolated worker boundary'],
  ['Verify', 'Independent artifact and receipt verification'],
  ['Learn', 'Evidence-backed economics and telemetry'],
] as const;

export default function Home() {
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const buildGraphConfigured = Boolean(process.env.BUILDGRAPH_BASE_URL);
  const mode = process.env.OPPORTUNITYOS_EXECUTION_MODE ?? 'simulation';

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Release 0.1.0-simulation</p>
          <h1>OpportunityOS</h1>
          <p className="lede">Turn opportunities into governed WorkOrders, with reuse-first preflight, explicit human gates, independent verification, and honest economics.</p>
        </div>
        <div className="modeCard">
          <span>Execution mode</span>
          <strong>{mode.toUpperCase()}</strong>
          <small>Consequential external side effects are disabled in this release.</small>
        </div>
      </header>

      <section className="statusGrid" aria-label="Runtime configuration">
        <article><span>PostgreSQL</span><strong>{databaseConfigured ? 'Configured' : 'Not configured'}</strong></article>
        <article><span>BuildGraph</span><strong>{buildGraphConfigured ? 'Configured' : 'Not configured'}</strong></article>
        <article><span>Trust Kernel</span><strong>Enabled</strong></article>
        <article><span>Verification</span><strong>Independent</strong></article>
      </section>

      <section>
        <div className="sectionTitle">
          <p className="eyebrow">Execution system</p>
          <h2>One path from evidence to verified output</h2>
        </div>
        <div className="stageGrid">
          {stages.map(([title, description], index) => (
            <article className="stage" key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="boundary">
        <div>
          <p className="eyebrow">Operator boundary</p>
          <h2>Needs You means the system stops.</h2>
        </div>
        <p>Missing evidence, a BuildGraph reuse recommendation, an invalid approval, an expired authorization, a verification failure, or any attempt to leave simulation mode must fail closed rather than invent success.</p>
      </section>
    </main>
  );
}
