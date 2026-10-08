import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Settings,
  Wine,
  Pilcrow,
  RotateCcw,
  SpellCheck2,
  Type,
  WrapText,
  PenTool,
  Hand,
  HardDrive,
  Trash2,
  Palette,
  Github,
  Network,
  Image as ImageIcon,
} from "lucide-react";
import { useI18n } from "@/contexts/i18n-context";
import type { Vault } from "@shared/schema";
import AppearanceThemePicker from "@/components/appearance-theme-picker";
import RepositoryConfigurationForm, { type RepositoryConfiguration } from "@/components/repository-configuration-form";
import type { SavedRepoLocal } from "@/lib/saved-repos";
import { resetEditorPreferences, updateEditorPreferences, useEditorPreferences } from "@/lib/editor-preferences";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { setCollaborationTransportPreference, useCollaborationTransportPreference } from "@/lib/collaboration-preferences";

function EditorToggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  icon,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] p-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <span className="mt-0.5 text-[hsl(var(--obsidian-text-muted))]">{icon}</span>}
        <div>
          <Label htmlFor={id} className="cursor-pointer text-sm text-[hsl(var(--obsidian-text))]">{label}</Label>
          <p className="mt-0.5 text-xs leading-5 text-[hsl(var(--obsidian-text-muted))]">{description}</p>
        </div>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

// Appearance Settings Component
export function AppearanceSettings() {
  const editorPreferences = useEditorPreferences();
  const { t } = useI18n();

  return (
    <Card className="bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[hsl(var(--obsidian-text))]">
          <Wine className="h-4 w-4" />
          {t("settings.appearance")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          <AppearanceThemePicker />

          <Separator />

          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium text-[hsl(var(--obsidian-text))]">{t("settings.drawingInput")}</Label>
              <p className="mt-1 text-xs text-[hsl(var(--obsidian-text-muted))]">{t("settings.drawingDescription")}</p>
            </div>
            <EditorToggle id="drawing-finger" label={t("settings.drawWithFinger")} description={t("settings.drawWithFingerDescription")} checked={editorPreferences.drawWithFinger} onCheckedChange={(drawWithFinger) => updateEditorPreferences({ drawWithFinger })} icon={<Hand className="h-4 w-4" />} />
            <div className="grid gap-3 rounded-lg border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] p-3 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="drawing-toolbar-side">{t("settings.toolbarSide")}</Label><Select value={editorPreferences.drawingToolbarSide} onValueChange={(drawingToolbarSide: "left" | "right") => updateEditorPreferences({ drawingToolbarSide })}><SelectTrigger id="drawing-toolbar-side"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="left">{t("settings.left")}</SelectItem><SelectItem value="right">{t("settings.right")}</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><div className="flex justify-between"><Label htmlFor="drawing-pen-width">{t("settings.defaultPenWidth")}</Label><span className="font-mono text-xs">{editorPreferences.defaultPenWidth}px</span></div><Slider id="drawing-pen-width" min={1} max={12} step={1} value={[editorPreferences.defaultPenWidth]} onValueChange={([defaultPenWidth]) => updateEditorPreferences({ defaultPenWidth })} /></div>
              <div className="space-y-2"><div className="flex justify-between"><Label htmlFor="drawing-pressure">{t("settings.pressureResponse")}</Label><span className="font-mono text-xs">{editorPreferences.pressureSensitivity.toFixed(1)}×</span></div><Slider id="drawing-pressure" min={0} max={2} step={0.1} value={[editorPreferences.pressureSensitivity]} onValueChange={([pressureSensitivity]) => updateEditorPreferences({ pressureSensitivity })} /></div>
              <div className="space-y-2"><div className="flex justify-between"><Label htmlFor="drawing-smoothing">{t("settings.strokeSmoothing")}</Label><span className="font-mono text-xs">{Math.round(editorPreferences.strokeSmoothing * 100)}%</span></div><Slider id="drawing-smoothing" min={0} max={1} step={0.05} value={[editorPreferences.strokeSmoothing]} onValueChange={([strokeSmoothing]) => updateEditorPreferences({ strokeSmoothing })} /></div>
            </div>
            <p className="flex items-start gap-2 text-xs text-muted-foreground"><PenTool className="mt-0.5 h-3.5 w-3.5 flex-none" />Pressure and tilt are used when the browser and device report them. Mouse strokes use a constant width and the toolbar eraser is always available.</p>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="text-[hsl(var(--obsidian-text))] text-sm font-medium">{t("settings.markdownEditor")}</Label>
                <p className="mt-1 text-xs text-[hsl(var(--obsidian-text-muted))]">{t("settings.changesStored")}</p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={resetEditorPreferences} className="h-8 text-xs">
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />{t("settings.reset")}
              </Button>
            </div>

            <div className="space-y-2 rounded-lg border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] p-3">
              <Label htmlFor="editor-default-mode">{t("settings.defaultMarkdownEditor")}</Label>
              <Select value={editorPreferences.defaultMarkdownMode} onValueChange={(defaultMarkdownMode: "live" | "source") => updateEditorPreferences({ defaultMarkdownMode })}>
                <SelectTrigger id="editor-default-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="live">{t("settings.visualEditor")}</SelectItem>
                  <SelectItem value="source">{t("settings.sourceEditor")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("settings.editingViewDescription")}</p>
            </div>

            <EditorToggle
              id="editor-line-numbers"
              label={t("settings.lineNumbers")}
              description={t("settings.lineNumbersDescription")}
              checked={editorPreferences.showLineNumbers}
              onCheckedChange={(showLineNumbers) => updateEditorPreferences({ showLineNumbers })}
              icon={<Pilcrow className="h-4 w-4" />}
            />
            <EditorToggle
              id="editor-line-wrap"
              label={t("settings.wrapLongLines")}
              description={t("settings.wrapLongLinesDescription")}
              checked={editorPreferences.lineWrapping}
              onCheckedChange={(lineWrapping) => updateEditorPreferences({ lineWrapping })}
              icon={<WrapText className="h-4 w-4" />}
            />
            <EditorToggle
              id="editor-active-line"
              label={t("settings.cursorLine")}
              description={t("settings.cursorLineDescription")}
              checked={editorPreferences.highlightActiveLine}
              onCheckedChange={(highlightActiveLine) => updateEditorPreferences({ highlightActiveLine })}
              icon={<Type className="h-4 w-4" />}
            />
            <EditorToggle
              id="editor-spellcheck"
              label={t("settings.spellCheck")}
              description={t("settings.spellCheckDescription")}
              checked={editorPreferences.spellCheck}
              onCheckedChange={(spellCheck) => updateEditorPreferences({ spellCheck })}
              icon={<SpellCheck2 className="h-4 w-4" />}
            />

            <div className="grid gap-3 rounded-lg border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] p-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="editor-typeface">{t("settings.previewTypeface")}</Label>
                <Select value={editorPreferences.fontFamily} onValueChange={(fontFamily: "mono" | "sans") => updateEditorPreferences({ fontFamily })}>
                  <SelectTrigger id="editor-typeface"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mono">{t("settings.monospace")}</SelectItem>
                    <SelectItem value="sans">{t("settings.sansSerif")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="editor-width">{t("settings.writingWidth")}</Label>
                <Select value={editorPreferences.contentWidth} onValueChange={(contentWidth: "comfortable" | "wide" | "full") => updateEditorPreferences({ contentWidth })}>
                  <SelectTrigger id="editor-width"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comfortable">{t("settings.comfortable")}</SelectItem>
                    <SelectItem value="wide">{t("settings.wide")}</SelectItem>
                    <SelectItem value="full">{t("settings.fullWidth")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="editor-alignment">{t("settings.writingPosition")}</Label>
                <Select value={editorPreferences.contentAlignment} onValueChange={(contentAlignment: "left" | "center" | "right") => updateEditorPreferences({ contentAlignment })}>
                  <SelectTrigger id="editor-alignment"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">{t("settings.alignLeft")}</SelectItem>
                    <SelectItem value="center">{t("settings.alignCenter")}</SelectItem>
                    <SelectItem value="right">{t("settings.alignRight")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] p-3">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="editor-font-size">{t("settings.editorTextSize")}</Label>
                <span className="rounded bg-[hsl(var(--obsidian-panel))] px-2 py-1 font-mono text-xs">{editorPreferences.fontSize}px</span>
              </div>
              <Slider
                id="editor-font-size"
                min={13}
                max={20}
                step={1}
                value={[editorPreferences.fontSize]}
                onValueChange={([fontSize]) => updateEditorPreferences({ fontSize })}
                aria-label={t("settings.editorTextSize")}
              />
            </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <Label className="text-[hsl(var(--obsidian-text))] text-sm font-medium">{t("settings.imageDrop")}</Label>
                <p className="mt-1 text-xs text-[hsl(var(--obsidian-text-muted))]">{t("settings.imageDropDescription")}</p>
              </div>
              <div className="space-y-2 rounded-lg border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] p-3">
                <Label htmlFor="image-drop-location">{t("settings.imageDropLocation")}</Label>
                <Select value={editorPreferences.imageDropLocation} onValueChange={(imageDropLocation: "figures" | "note-folder" | "ask") => updateEditorPreferences({ imageDropLocation })}>
                  <SelectTrigger id="image-drop-location"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="figures">{t("settings.imageDropFigures")}</SelectItem>
                    <SelectItem value="note-folder">{t("settings.imageDropNoteFolder")}</SelectItem>
                    <SelectItem value="ask">{t("settings.imageDropAsk")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <EditorToggle
                id="show-figures-folder"
                label={t("settings.showFiguresFolder")}
                description={t("settings.showFiguresFolderDescription")}
                checked={editorPreferences.showFiguresFolder}
                onCheckedChange={(showFiguresFolder) => updateEditorPreferences({ showFiguresFolder })}
                icon={<ImageIcon className="h-4 w-4" />}
              />
            </div>

          </div>
      </CardContent>
    </Card>
  );
}

export function AppearancePreferencesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-sidebar))] sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[hsl(var(--obsidian-text))]">
            <Palette className="h-5 w-5" />
            {t("settings.preferencesTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("settings.preferencesDescription")}
          </DialogDescription>
        </DialogHeader>
        <AppearanceSettings />
        <CollaborationTransportSettings />
      </DialogContent>
    </Dialog>
  );
}

function CollaborationTransportSettings() {
  const { t } = useI18n();
  const transport = useCollaborationTransportPreference();
  return (
    <Card className="bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[hsl(var(--obsidian-text))]">
          <Network className="h-4 w-4" />
          {t("settings.collaborationTransport")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <EditorToggle
          id="default-encrypted-relay"
          label={t("settings.defaultEncryptedRelay")}
          description={t("settings.defaultEncryptedRelayDescription")}
          checked={transport === "relay"}
          onCheckedChange={(checked) => setCollaborationTransportPreference(checked ? "relay" : "direct")}
          icon={<Network className="h-4 w-4" />}
        />
      </CardContent>
    </Card>
  );
}

// Main Dialog Component
interface VaultSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vault: Vault;
  repo: SavedRepoLocal;
  token: string;
  hasUnsyncedChanges: boolean;
  onRepositorySave: (configuration: RepositoryConfiguration) => Promise<void>;
  onClearLocalCopies: () => Promise<void> | void;
  settingsEditable?: boolean;
}

export default function VaultSettingsDialog({
  open,
  onOpenChange,
  vault,
  repo,
  token,
  hasUnsyncedChanges,
  onRepositorySave,
  onClearLocalCopies,
  settingsEditable = true,
}: VaultSettingsDialogProps) {
  const editorPreferences = useEditorPreferences();
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[hsl(var(--obsidian-text))]">
            <Settings className="h-5 w-5" />
            {t("settings.workspaceSettings")}
          </DialogTitle>
          <DialogDescription>{t("settings.workspaceSettingsDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Card className="bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[hsl(var(--obsidian-text))]">
                <Github className="h-4 w-4" aria-hidden="true" />
                {t("settings.repositoryContent")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] px-3 py-2">
                <span className="text-sm text-[hsl(var(--obsidian-text-muted))]">{t("settings.workspaceName")}</span>
                <span className="min-w-0 truncate text-right font-mono text-sm text-[hsl(var(--obsidian-text))]">{vault.name}</span>
              </div>
              <RepositoryConfigurationForm
                token={token}
                repoFullName={repo.repoFullName}
                initialBranch={repo.defaultBranch}
                initialRootScopes={repo.selectedRootScopes}
                initialFileTypes={repo.selectedFileTypes}
                initialAutoSync={repo.autoSync}
                initialAutoSyncIntervalSeconds={repo.autoSyncIntervalSeconds}
                initialAutoMergeNonOverlapping={repo.autoMergeNonOverlapping}
                initialCreateConflictBackup={repo.createConflictBackup}
                submitLabel={t("settings.saveRepository")}
                contentDisabled={hasUnsyncedChanges}
                disabledMessage={hasUnsyncedChanges ? t("settings.stagedChangesWarning") : undefined}
                readOnly={!settingsEditable}
                readOnlyMessage={!settingsEditable ? t("settings.sharedRepositoryReadOnly") : undefined}
                onSave={onRepositorySave}
              />
            </CardContent>
          </Card>
          <AppearanceSettings />
          <CollaborationTransportSettings />
          <Card className="bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
            <CardHeader><CardTitle className="flex items-center gap-2 text-[hsl(var(--obsidian-text))]"><HardDrive className="h-4 w-4" />{t("settings.offlineRecovery")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <EditorToggle id="offline-recovery" label={t("settings.keepRecoveryDrafts")} description={t("settings.keepRecoveryDraftsDescription")} checked={editorPreferences.keepOfflineDrafts} onCheckedChange={(keepOfflineDrafts) => updateEditorPreferences({ keepOfflineDrafts })} />
              <Button type="button" variant="outline" onClick={() => void onClearLocalCopies()}><Trash2 className="mr-2 h-4 w-4" />{t("settings.removeRecoveryCopies")}</Button>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
