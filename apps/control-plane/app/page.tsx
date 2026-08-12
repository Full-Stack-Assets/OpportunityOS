const pipeline = [
  { label: 'Discover', count: 32, detail: 'Opportunities' },
  { label: 'Evaluate', count: 18, detail: 'Opportunities' },
  { label: 'Approve', count: 7, detail: 'Human gates' },
  { label: 'Execute', count: 12, detail: 'Simulation runs' },
  { label: 'Verify', count: 5, detail: 'Independent checks' },
  { label: 'Close', count: 3, detail: 'Verified outcomes' },
] as const;

const opportunities = [
  { name: 'AI Document Intelligence SaaS', score: 87, status: 'Evaluating', owner: 'Atlas', icon: 'DI' },
  { name: 'Procurement Data API', score: 82, status: 'Approved', owner: 'Atlas', icon: 'API' },
  { name: 'Vertical AI for Real Estate', score: 76, status: 'Executing', owner: 'Atlas', icon: 'RE' },
  { name: 'Workflow Automation Tool', score: 71, status: 'Evaluating', owner: 'Atlas', icon: 'WA' },
] as const;

const navigation = ['Overview', 'Opportunities', 'Pipeline', 'Execution', 'Verification', 'Analytics', 'Integrations', 'Settings'] as const;

export default function Home() {
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const buildGraphConfigured = Boolean(process.env.BUILDGRAPH_BASE_URL);
  const mode = process.env.OPPORTUNITYOS_EXECUTION_MODE ?? 'simulation';

  return (
    <main className="siteShell">
      <nav className="topNav" aria-label="OpportunityOS marketing navigation">
        <a className="wordmark" href="#top"><span className="wordmarkMark">O</span><strong>OPPORTUNITYOS</strong></a>
        <div className="topLinks"><a href="#platform">Platform</a><a href="#capabilities">Capabilities</a><a href="#boundary">Governance</a><a href="#runtime">Runtime</a></div>
        <span className="reviewBadge">Review branch</span>
      </nav>

      <header className="hero" id="top">
        <p className="eyebrow">Governed opportunity execution</p>
        <h1>From Opportunity Discovery to Verified Execution.</h1>
        <p className="lede">Structure, authorize, execute, and verify opportunities with immutable records, reuse-first preflight, explicit approvals, and honest economic tracking.</p>
        <div className="heroActions"><a className="primaryButton" href="#platform">Explore control plane</a><a className="secondaryButton" href="#boundary">Review boundaries</a></div>
      </header>

      <section className="appFrame" id="platform" aria-label="OpportunityOS control plane preview">
        <aside className="sidebar">
          <div className="sideBrand"><span className="sideMark">O</span><div><strong>OPPORTUNITYOS</strong><small>Execution control plane</small></div></div>
          <nav className="sideNav" aria-label="Control plane navigation">
            {navigation.map((item, index) => <span className={index === 0 ? 'active' : ''} key={item}><i aria-hidden="true">{String(index + 1).padStart(2, '0')}</i>{item}</span>)}
          </nav>
          <div className="tenant"><span>AT</span><div><strong>Atlas Team</strong><small>Simulation workspace</small></div></div>
        </aside>

        <div className="workspace">
          <div className="previewNotice" role="note">
            <strong>Interface preview</strong>
            <span>Synthetic pipeline counts and opportunity records are shown to review the presentation layer. Runtime configuration below is read from the current environment.</span>
          </div>

          <div className="workspaceTop">
            <div><p className="eyebrow">Pipeline overview</p><h2>Decision compression, without hidden authority.</h2></div>
            <div className="modePill"><span>Execution mode</span><strong>{mode.toUpperCase()}</strong></div>
          </div>

          <div className="pipelineGrid" id="capabilities">
            {pipeline.map((stage, index) => (
              <article className={`pipelineCard pipeline-${index + 1}`} key={stage.label}>
                <span className="pipelineIcon">{String(index + 1).padStart(2, '0')}</span>
                <div><p>{stage.label}</p><strong>{stage.count}</strong><small>{stage.detail}</small></div>
              </article>
            ))}
          </div>

          <section className="opportunityPanel">
            <div className="panelHeader"><div><p className="eyebrow">Synthetic review data</p><h3>Active Opportunities</h3></div><span>Four representative records</span></div>
            <div className="tableWrap">
              <table>
                <thead><tr><th>Opportunity</th><th>Score</th><th>Status</th><th>Owner</th></tr></thead>
                <tbody>
                  {opportunities.map((opportunity) => (
                    <tr key={opportunity.name}>
                      <td><span className="opportunityIcon">{opportunity.icon}</span><strong>{opportunity.name}</strong></td>
                      <td><span className="score">{opportunity.score}</span></td>
                      <td><span className={`status status-${opportunity.status.toLowerCase()}`}>{opportunity.status}</span></td>
                      <td>{opportunity.owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="runtimeGrid" id="runtime" aria-label="Runtime configuration">
            <article><span>PostgreSQL</span><strong>{databaseConfigured ? 'Configured' : 'Not configured'}</strong><small>Persistence adapter</small></article>
            <article><span>BuildGraph</span><strong>{buildGraphConfigured ? 'Configured' : 'Not configured'}</strong><small>Reuse preflight</small></article>
            <article><span>Trust Kernel</span><strong>Enabled</strong><small>Authorization boundary</small></article>
            <article><span>Verification</span><strong>Independent</strong><small>Receipt-backed outcomes</small></article>
          </section>
        </div>
      </section>

      <section className="valueSection">
        <p>Structure, authorize, execute, and verify opportunities with immutable records, DAGs, and economic tracking.</p>
        <div className="valueGrid">
          <article><span>AI</span><h3>AI Systems</h3><p>Discover and evaluate high-impact opportunities without disguising uncertain evidence as fact.</p></article>
          <article><span>EX</span><h3>Execution Engine</h3><p>Compile governed WorkOrders and orchestrate only the actions the current authorization permits.</p></article>
          <article><span>VR</span><h3>Verification</h3><p>Verify outputs with independent checks, immutable receipts, and explicit failure states.</p></article>
        </div>
      </section>

      <section className="boundary" id="boundary">
        <div><p className="eyebrow">Operator boundary</p><h2>Needs You means the system stops.</h2></div>
        <p>Missing evidence, a reuse recommendation, an invalid or expired approval, a verification failure, or any attempt to leave simulation mode fails closed. This interface does not widen the authority of the underlying release.</p>
      </section>
    </main>
  );
}
