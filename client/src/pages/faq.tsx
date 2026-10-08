import { useEffect } from "react";
import { ArrowUpRight, FileText, Github, LockKeyhole, MessageCircle, Users } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import Layout from "@/components/layout";
import { useI18n } from "@/contexts/i18n-context";


export default function FAQPage() {
  const { t } = useI18n();
  const faqs = [
    { id: "what-is-marktwin", question: "faq.whatIs.question", answer: "faq.whatIs.answer" },
    { id: "where-is-content-stored", question: "faq.storage.question", answer: "faq.storage.answer" },
    { id: "credentials", question: "faq.credentials.question", answer: "faq.credentials.answer" },
    { id: "private-collaboration-works", question: "faq.collaboration.question", answer: "faq.collaboration.answer" },
    { id: "collaborators-accounts", question: "faq.accounts.question", answer: "faq.accounts.answer" },
    { id: "edit-view-links", question: "faq.links.question", answer: "faq.links.answer" },
    { id: "collaborators-commit", question: "faq.commit.question", answer: "faq.commit.answer" },
    { id: "merge-conflicts", question: "faq.merge.question", answer: "faq.merge.answer" },
    { id: "offline-work", question: "faq.offline.question", answer: "faq.offline.answer" },
    { id: "mobile-browsers", question: "faq.mobile.question", answer: "faq.mobile.answer" },
    { id: "report-problem", question: "faq.report.question", answer: "faq.report.answer" },
  ];

  useEffect(() => {
    if (!window.location.hash) return;
    const id = window.location.hash.substring(1);
    const element = document.getElementById(id);
    if (element) setTimeout(() => element.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  return (
    <Layout mainClassName="pt-10 md:pt-16">
      <div className="mx-auto w-full max-w-6xl pb-12">
        <section className="grid items-start gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
          <div className="lg:sticky lg:top-8">
            <h1 className="mx-auto mt-6 max-w-md text-center text-4xl font-semibold leading-[1.04] tracking-[-0.055em] text-[hsl(var(--obsidian-accent))] md:text-5xl">{t("faq.title")}</h1>
            <p className="mt-6 max-w-md text-base leading-7 text-[hsl(var(--obsidian-text-muted))]">{t("faq.description")}</p>
            <div className="mt-8 space-y-3 text-sm text-[hsl(var(--obsidian-text-muted))]">
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--obsidian-sidebar)/0.72)] px-3 py-2 marktwin-control-shadow"><Github className="h-4 w-4 text-[hsl(var(--obsidian-accent))]" aria-hidden="true" /> {t("faq.repositoryLabel")}</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--obsidian-sidebar)/0.72)] px-3 py-2 marktwin-control-shadow"><LockKeyhole className="h-4 w-4 text-[hsl(var(--obsidian-accent))]" aria-hidden="true" /> {t("faq.privateLabel")}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--obsidian-sidebar)/0.72)] px-3 py-2 marktwin-control-shadow"><FileText className="h-4 w-4 text-[hsl(var(--obsidian-accent))]" aria-hidden="true" /> {t("faq.toolsLabel")}</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--obsidian-sidebar)/0.72)] px-3 py-2 marktwin-control-shadow"><Users className="h-4 w-4 text-[hsl(var(--obsidian-accent))]" aria-hidden="true" /> {t("faq.collaborationLabel")}</span>
              </div>
            </div>
            <a href="https://github.com/OptimAI-labs/marktwin/issues" className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-[hsl(var(--primary))] hover:underline">
              {t("faq.contactButton")} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          <div className="rounded-[1.75rem] bg-[hsl(var(--obsidian-sidebar)/0.64)] px-5 py-3 marktwin-surface-shadow sm:px-8">
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq) => (
                <div key={faq.id} itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                  <AccordionItem value={faq.id} id={faq.id} className="border-b border-[hsl(var(--obsidian-border)/0.58)] last:border-b-0">
                    <AccordionTrigger className="py-5 text-left text-base font-medium tracking-[-0.01em] text-[hsl(var(--obsidian-text))] hover:no-underline hover:text-[hsl(var(--primary))]" itemProp="name">
                      {t(faq.question)}
                    </AccordionTrigger>
                    <AccordionContent className="max-w-2xl pb-6 text-sm leading-7 text-[hsl(var(--obsidian-text-muted))]" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                      <span itemProp="text">{t(faq.answer)}</span>
                    </AccordionContent>
                  </AccordionItem>
                </div>
              ))}
            </Accordion>
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-2xl text-center">
          <MessageCircle className="mx-auto h-5 w-5 text-[hsl(var(--primary))]" aria-hidden="true" />
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.035em] text-[hsl(var(--obsidian-text))]">{t("faq.contactTitle")}</h2>
          <p className="mt-3 text-sm leading-7 text-[hsl(var(--obsidian-text-muted))]">{t("faq.contactDescription")}</p>
        </section>
      </div>
    </Layout>
  );
}
