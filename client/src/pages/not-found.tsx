import { Button } from "@/components/ui/button";
import Layout from "@/components/layout";
import { Link } from "wouter";
import { useI18n } from "@/contexts/i18n-context";

export default function NotFound() {
  const { t } = useI18n();
  return <Layout>
    <section data-not-found-page className="mx-auto max-w-lg py-16 text-center">
      <p className="mb-4 text-sm text-muted-foreground">404</p>
      <h1 className="text-3xl font-semibold">{t("errors.notFoundTitle")}</h1>
      <Button asChild variant="link" className="mt-6"><Link href="/">{t("errors.returnHome")}</Link></Button>
    </section>
  </Layout>;
}
