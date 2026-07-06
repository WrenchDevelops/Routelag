export function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="feature-card">
      <h3 className="feature-card-title">{title}</h3>
      <p className="feature-card-description">{description}</p>
    </div>
  );
}
