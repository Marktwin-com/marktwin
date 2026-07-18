import { useEffect } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import Layout from "@/components/layout";
import { Mail } from "lucide-react";

export default function FAQPage() {
  const faqs = [
    {
      id: "what-is-marktwin",
      question: "What is Marktwin?",
      answer: "Marktwin is a collaborative agent workspace for defining rules, skills, tools, boundaries, examples, and decisions together before an owner publishes reviewed Markdown to GitHub."
    },
    {
      id: "where-is-content-stored",
      question: "Where is my document content stored?",
      answer: "Published documents live in your GitHub repository. Selected files and unsynced work also live temporarily in collaborating browsers. Marktwin servers do not receive or store the Markdown."
    },
    {
      id: "private-collaboration-works",
      question: "How does private collaboration work?",
      answer: "Your browser acts as the host for the session. When you share a link, updates are synced directly between you and your collaborators using secure peer-to-peer connections. Because your document is never stored on our servers, remember to keep your browser tab open to keep the collaboration session active!"
    },
    {
      id: "collaborators-commit",
      question: "Can collaborators commit to my GitHub repository?",
      answer: "No. The owner remains the only browser with the GitHub credential and the only user who can commit through Marktwin."
    },
    {
      id: "edit-view-links",
      question: "What is the difference between edit and view links?",
      answer: "Edit links can change Markdown and participate in Discussion. View links can read and discuss but cannot send document or owner-control updates. Only the owner can review and publish to GitHub."
    },
    {
      id: "collaborators-accounts",
      question: "Do collaborators need Marktwin accounts?",
      answer: "There are no Marktwin accounts at all. Collaborators just open the invite link in their browser; only the repository owner needs a GitHub token."
    },
    {
      id: "gitlab-support",
      question: "Can I connect my gitlab repo?",
      answer: "Not currently. The present Git adapter targets GitHub; GitLab support is not committed to a release date."
    },

    {
      id: "offline-work",
      question: "Can I work offline?",
      answer: "If GitHub disconnects after loading, staged work remains in the open browser and live peers can continue where their WebRTC connection survives. It is not a durable offline draft: do not close every copy before reconnecting and syncing."
    },
    {
      id: "merge-conflicts",
      question: "What happens if there's a merge conflict?",
      answer: "Right now, if we detect a conflict when you try to push, Marktwin safely commits your work to a new branch instead of overwriting the main branch. In the future, we plan to add native conflict resolution right inside the editor!"
    },
    {
      id: "mobile-browsers",
      question: "Does it work on mobile browsers?",
      answer: "Yes for reading, Discussion, presence, decision capture, Changes review, and small edits. Files, Document, Discussion, and Changes use mobile panel navigation; complex tree administration is still best on desktop."
    },
    {
      id: "self-host",
      question: "Can I self-host Marktwin?",
      answer: "Yes. Marktwin is open source (GPL-3.0-or-later). Clone the repository and run `npm install && npm run dev` — no database or account setup required. See the README on GitHub for details."
    },
    {
      id: "open-source",
      question: "Is Marktwin open source?",
      answer: "Yes, the full source is on GitHub under the GPL-3.0-or-later license. Contributions, forks, and self-hosted deployments are welcome."
    },
    {
      id: "report-problem",
      question: "How do I report a problem or request a feature?",
      answer: "Open an issue on GitHub with your browser, the repository workflow you were using, and steps to reproduce. For security issues, please email us privately instead of opening a public issue. Either way, never include private repository tokens or confidential document content."
    }
  ];

  useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.substring(1);
      const element = document.getElementById(id);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, []);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6">
        <section className="max-w-3xl mx-auto mb-16">
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-bold text-[hsl(var(--obsidian-text))] mb-6">
              Frequently Asked Questions
            </h1>
            <p className="text-lg text-[hsl(var(--obsidian-text-muted))] leading-7">
              Practical answers about privacy, GitHub ownership, and collaboration in Marktwin.
            </p>
          </div>

          <div itemScope itemType="https://schema.org/FAQPage">
            <Accordion type="single" collapsible className="space-y-4 w-full">
              {faqs.map((faq) => (
                <div key={faq.id} itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                  <AccordionItem
                    value={faq.id}
                    className="bg-[hsl(var(--obsidian-sidebar))] border border-[hsl(var(--obsidian-border))] rounded-lg px-6"
                  >
                    <AccordionTrigger className="text-xl font-semibold text-[hsl(var(--obsidian-text))] hover:no-underline hover:text-primary transition-colors text-left" itemProp="name">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-[hsl(var(--obsidian-text-muted))] leading-7 text-lg">
                      <div itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                        <span itemProp="text">{faq.answer}</span>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </div>
              ))}
            </Accordion>
          </div>
        </section>

        <section id="contact" className="max-w-3xl mx-auto mt-20 pt-16 border-t border-[hsl(var(--obsidian-border))] text-center scroll-mt-24">
          <h2 className="text-3xl md:text-4xl font-bold text-[hsl(var(--obsidian-text))] mb-6">
            Let&apos;s chat!
          </h2>

          <p className="text-lg text-[hsl(var(--obsidian-text-muted))] leading-relaxed mb-8 max-w-2xl mx-auto">
            Marktwin was born because we needed a way to collaborate that fit our workflow without compromising privacy, and we figured others did too. It was built as a passion project at OptimAI Labs, where one of our core values is to share what we create. Enjoy!
          </p>

          <div className="mt-8 flex justify-center">
            <a href="mailto:nwolf@optimai.cl">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-6 text-lg rounded-md flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Contact Us
              </Button>
            </a>
          </div>
        </section>
      </div>
    </Layout>
  );
}
