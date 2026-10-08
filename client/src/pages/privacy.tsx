import Layout from "@/components/layout";
export default function PrivacyPage() {
  return <Layout><article className="mx-auto max-w-3xl space-y-6 py-8 leading-relaxed">
    <h1 className="text-3xl font-semibold">Privacy in this self-hosted edition</h1>
    <p>Marktwin has no account system or product telemetry. Your browser connects directly to GitHub and keeps GitHub credentials in session storage. Saved Cabinets, profile information, and preferences stay in this browser.</p>
    <section className="space-y-2"><h2 className="text-xl font-semibold">Local recovery</h2><p>Recovery is enabled by default and stores private draft content in IndexedDB on this device. These copies are not an encrypted vault. You can disable offline drafts or clear recovery copies in Cabinet settings. Use a trusted browser profile for private work.</p></section>
    <section className="space-y-2"><h2 className="text-xl font-semibold">Collaboration</h2><p>The application server temporarily relays WebRTC negotiation data. Workspace content and chat travel through encrypted peer connections. Configured STUN and TURN services can observe connection metadata; a TURN relay carries encrypted traffic without the document key. Invite secrets stay in URL fragments.</p></section>
    <section className="space-y-2"><h2 className="text-xl font-semibold">Requests and logs</h2><p>Your hosting provider and reverse proxy may retain access logs. Application logs omit query values and do not record private request bodies or collaboration payloads. Font providers may receive normal font-resource requests. Print / Save as PDF runs locally with external resources blocked.</p></section>
    <p>Deployment-specific privacy terms and contact details are the responsibility of the operator hosting this instance. The hosted service at marktwin.com has its own policies.</p>
    <a className="underline" href="https://github.com/OptimAI-labs/marktwin/blob/main/docs/PRIVACY.md">Source documentation</a>
  </article></Layout>;
}
