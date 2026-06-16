import Layout from "@/components/layout";

export default function TermsPage() {
  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 text-[hsl(var(--obsidian-text))]">
        <h1 className="text-4xl font-bold mb-6">Terms of Service</h1>
        <p className="text-[hsl(var(--obsidian-text-muted))] mb-8">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <div className="space-y-6 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold mb-3">1. Agreement to Terms</h2>
            <p>By accessing or using Marktwin, a product of OptimAI Labs Ltda ("Company", "we", "us", or "our") based in Chile, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, then you do not have permission to access the Service.</p>
            <p className="mt-2">These terms apply to the hosted Marktwin service at marktwin.com. If you self-host Marktwin, you are responsible for publishing terms that match your own deployment and users.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">2. Free Service</h2>
            <p>The first iteration of Marktwin is provided entirely free of charge. We reserve the right to modify, suspend, or discontinue the Service (or any part or content thereof) at any time with or without notice to you. We shall not be liable to you or to any third party for any modification, price change, suspension, or discontinuance of the Service.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">3. User Responsibilities & Acceptable Use</h2>
            <p>You are responsible for safeguarding the GitHub tokens that you use to access the Service. There is no Marktwin account or password. You agree not to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Use the Service in any unlawful manner or for any unlawful purpose.</li>
              <li>Attempt to gain unauthorized access to our servers or signaling infrastructure.</li>
              <li>Abuse the peer-to-peer collaboration infrastructure by transmitting malicious code or excessive traffic.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">4. Intellectual Property & User Content</h2>
            <p>The Service connects to your personal GitHub repositories. We do not claim any intellectual property rights over the material you provide, edit, or collaborate on using the Service. Your documents and data remain yours. The code, design, and architecture of Marktwin itself are the intellectual property of OptimAI Labs.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">5. Disclaimer of Warranties; Limitation of Liability</h2>
            <p>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. OptimAI Labs does not warrant that the Service will be uninterrupted, secure, or error-free. In no event shall OptimAI Labs be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, or goodwill, arising out of your use of the Service.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">6. Governing Law</h2>
            <p>These Terms shall be governed and construed in accordance with the laws of Chile, without regard to its conflict of law provisions. Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">7. Contact Us</h2>
            <p>If you have any questions about these Terms, please contact us at:</p>
            <p className="mt-2">
              <strong>OptimAI Labs</strong><br />
              Email address: <a href="mailto:nwolf@optimai.cl" className="text-primary hover:underline">nwolf@optimai.cl</a><br />
              Location: Chile
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
