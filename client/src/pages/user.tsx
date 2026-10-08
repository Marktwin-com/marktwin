import { useState } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AppearanceThemePicker from "@/components/appearance-theme-picker";
import LanguagePicker from "@/components/language-picker";
import AvatarPickerDialog from "@/components/avatar-picker-dialog";
import UserAvatar from "@/components/user-avatar";
import { useLocalProfile } from "@/contexts/local-profile-context";
import { useI18n } from "@/contexts/i18n-context";
import { resolveUserIdentity, resolveUserAvatarPreferences } from "@/lib/user-identity";
import { clearGitHubSessionCredentials } from "@/lib/github-session";

export default function UserSettings() {
  const { profile, updateUsername, updateAppPreferences } = useLocalProfile();
  const { t } = useI18n();
  const [name, setName] = useState(profile.username);
  const [message, setMessage] = useState("");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const identity = resolveUserIdentity(profile);
  const avatar = resolveUserAvatarPreferences(profile.appPreferences);
  return <Layout hideNavigation hideFooter mainClassName="pt-6">
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Button asChild variant="ghost"><Link href="/app">← {t("cabinet.title")}</Link></Button>
      <h1 className="text-3xl font-semibold">{t("user.openSettings")}</h1>
      <p className="text-sm text-muted-foreground">Your profile and preferences are saved in this browser.</p>
      <Card><CardHeader><CardTitle>Collaboration profile</CardTitle><CardDescription>Choose the name and color other participants see.</CardDescription></CardHeader><CardContent className="space-y-4">
        <Button variant="ghost" onClick={() => setAvatarOpen(true)} aria-label="Change profile color"><UserAvatar identity={identity} avatar={avatar} className="h-12 w-12" /></Button>
        <Label htmlFor="display-name">Display name</Label><Input id="display-name" value={name} maxLength={80} onChange={event => setName(event.target.value)} />
        <Button disabled={!name.trim()} onClick={async () => setMessage(await updateUsername(name) ? "Profile saved." : "Could not save your profile. Check browser storage permissions.")}>{t("common.save")}</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{t("user.appearanceTitle")}</CardTitle></CardHeader><CardContent><AppearanceThemePicker /></CardContent></Card>
      <Card><CardHeader><CardTitle>{t("user.languageTitle")}</CardTitle></CardHeader><CardContent><LanguagePicker /></CardContent></Card>
      <Card><CardHeader><CardTitle>GitHub credentials</CardTitle><CardDescription>Credentials are kept only in this browser session. Forgetting them leaves your Cabinets and recovery drafts intact.</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => { clearGitHubSessionCredentials(); setMessage("GitHub credentials forgotten for this session."); }}>Forget GitHub credentials</Button></CardContent></Card>
      <p role="status">{message}</p>
      <a className="text-sm underline" href="https://github.com/Marktwin-com/marktwin/issues">Feedback and feature requests</a>
    </div>
    <AvatarPickerDialog open={avatarOpen} onOpenChange={setAvatarOpen} identity={identity} avatar={avatar} onSave={value => updateAppPreferences({ avatarColorIndex: value.colorIndex })} />
  </Layout>;
}
