import Layout from "@/components/layout";

export default function TermsPage() {
  return <Layout>
    <article className="mx-auto max-w-3xl space-y-6 py-12 leading-relaxed">
      <h1 className="text-3xl font-semibold">Open-source license</h1>
      <p>Marktwin is free software licensed under the GNU General Public License, version 3 or any later version (GPL-3.0-or-later). See the repository license for the terms governing use, modification, and distribution.</p>
      <p><a className="underline" href="https://github.com/OptimAI-labs/marktwin/blob/main/LICENSE">Read the license</a></p>
      <p>The software is provided without warranty, as described in that license. Self-hosting operators are responsible for their deployment and any service terms they offer to their users.</p>
      <p>Your repository contents remain yours. GitHub and any optional network services you configure have their own terms.</p>
    </article>
  </Layout>;
}
