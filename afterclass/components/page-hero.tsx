export function PageHero({ step, title, description, children }: {
  step: string; title: string; description: string; children?: React.ReactNode;
}) {
  return <section className="panel page-hero">
    <span className="round-icon" aria-hidden="true">✳</span>
    <p className="eyebrow">{step}</p>
    <h1>{title}</h1>
    <p className="intro">{description}</p>
    {children && <div className="actions hero-actions">{children}</div>}
  </section>;
}