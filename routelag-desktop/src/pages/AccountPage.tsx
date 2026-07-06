import { CreditCard, ExternalLink, Gamepad2, MessageCircle, ShieldCheck } from "lucide-react";

export function AccountPage() {
  return (
    <main className="account-view">
      <header className="account-header">
        <div>
          <span>Account</span>
          <h1>Billing & Connections</h1>
          <p>Manage your RouteLag plan and link the accounts used for PathGen and support.</p>
        </div>
      </header>

      <section className="account-grid">
        <article className="account-plan-card">
          <span className="account-card-icon">
            <CreditCard size={22} strokeWidth={2} />
          </span>
          <div>
            <h2>RouteLag Beta</h2>
            <p>No active paid plan yet. Billing controls will be available before launch.</p>
          </div>
          <button type="button">Manage Plan</button>
        </article>

        <article className="account-connection-card">
          <span className="account-card-icon discord">
            <MessageCircle size={22} strokeWidth={2} />
          </span>
          <div>
            <h2>Discord</h2>
            <p>Connect Discord for support, tester roles, and beta announcements.</p>
          </div>
          <button type="button">
            Connect Discord
            <ExternalLink size={15} strokeWidth={2} />
          </button>
        </article>

        <article className="account-connection-card">
          <span className="account-card-icon epic">
            <Gamepad2 size={22} strokeWidth={2} />
          </span>
          <div>
            <h2>Epic Games</h2>
            <p>Connect Epic Games later for Fortnite-focused replay and profile features.</p>
          </div>
          <button type="button">
            Connect Epic
            <ExternalLink size={15} strokeWidth={2} />
          </button>
        </article>

        <article className="account-security-card">
          <span className="account-card-icon">
            <ShieldCheck size={22} strokeWidth={2} />
          </span>
          <div>
            <h2>Privacy</h2>
            <p>Connected accounts are optional. Replay parsing and account linking stay separate until you enable them.</p>
          </div>
        </article>
      </section>
    </main>
  );
}
