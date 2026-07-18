import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  User,
  Settings,
  Sun,
  Moon,
  Wine,
  Milk,
} from "lucide-react";
import { useTheme } from "@/contexts/theme-context";
import type { Vault } from "@shared/schema";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// Appearance Settings Component
function AppearanceSettings() {
  const { theme, setTheme } = useTheme();

  // Unified color options for both dark and light themes
  const colorOptions = [
    {
      name: "Plum",
      primary: "325 55% 45%",
      accent: "325 55% 45%",
      ring: "325 55% 45%",
      obsidianAccent: "325 55% 45%",
    },
    {
      name: "Blue",
      primary: "220 90% 60%",
      accent: "220 90% 60%",
      ring: "220 90% 60%",
      obsidianAccent: "220 90% 60%",
    },
    {
      name: "Emerald",
      primary: "142 76% 36%",
      accent: "142 76% 36%",
      ring: "142 76% 36%",
      obsidianAccent: "142 76% 36%",
    },
    {
      name: "Orange",
      primary: "30 100% 50%",
      accent: "30 100% 50%",
      ring: "30 100% 50%",
      obsidianAccent: "30 100% 50%",
    },
    {
      name: "Pink",
      primary: "340 82% 65%",
      accent: "340 82% 65%",
      ring: "340 82% 65%",
      obsidianAccent: "340 82% 65%",
    },
  ];

  // Persisted index for dark theme color
  const getStoredDarkColor = () => localStorage.getItem("darkThemeColorIndex") || "0";
  const [darkColorIndex, setDarkColorIndex] = useState(Number(getStoredDarkColor()));

  useEffect(() => {
    if (theme === "dark") {
      const color = colorOptions[darkColorIndex];
      const root = document.documentElement;
      root.style.setProperty("--primary", color.primary);
      root.style.setProperty("--accent", color.accent);
      root.style.setProperty("--ring", color.ring);
      root.style.setProperty("--obsidian-accent", color.obsidianAccent);
    }
  }, [theme, darkColorIndex]);

  const handleDarkColorSelect = (idx: number) => {
    setDarkColorIndex(idx);
    localStorage.setItem("darkThemeColorIndex", String(idx));
  };

  // Persisted index for light theme color
  const getStoredLightColor = () => localStorage.getItem("lightThemeColorIndex") || "0";
  const [lightColorIndex, setLightColorIndex] = useState(Number(getStoredLightColor()));

  useEffect(() => {
    if (theme === "light") {
      const color = colorOptions[lightColorIndex];
      const root = document.documentElement;
      root.style.setProperty("--primary", color.primary);
      root.style.setProperty("--accent", color.accent);
      root.style.setProperty("--ring", color.ring);
      root.style.setProperty("--obsidian-accent", color.obsidianAccent);
    }
  }, [theme, lightColorIndex]);

  const handleLightColorSelect = (idx: number) => {
    setLightColorIndex(idx);
    localStorage.setItem("lightThemeColorIndex", String(idx));
  };

  return (
    <Card className="bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[hsl(var(--obsidian-text))]">
          <Wine className="h-4 w-4" />
          Appearance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Theme Settings */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-[hsl(var(--obsidian-text))] text-sm font-medium">Theme</Label>
              <p className="text-[hsl(var(--obsidian-text-muted))] text-xs">
                Choose your preferred theme
              </p>
              <ToggleGroup
                type="single"
                value={theme}
                onValueChange={(value) =>
                  value && setTheme(value as "root" | "cream" | "light" | "dark")
                }
                className="justify-start"
              >
                <ToggleGroupItem value="root" aria-label="Root theme">
                  <Wine className="h-4 w-4" />
                  <span className="sr-only">Root</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="cream" aria-label="Cream theme">
                  <Milk className="h-4 w-4" />
                  <span className="sr-only">Cream</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="light" aria-label="Light theme">
                  <Sun className="h-4 w-4" />
                  <span className="sr-only">Light</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="dark" aria-label="Dark theme">
                  <Moon className="h-4 w-4" />
                  <span className="sr-only">Dark</span>
                </ToggleGroupItem>
              </ToggleGroup>

              {/* Color picker for both light and dark themes */}
              {(theme === "light" || theme === "dark") && (
                <div className="mt-4">
                  <div className="text-xs text-[hsl(var(--obsidian-text-muted))] mb-2 font-medium">
                    Primary Color
                  </div>
                  <div className="flex gap-3">
                    {colorOptions.map((color, idx) => (
                      <button
                        key={color.name}
                        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-200 shadow-md focus:outline-none ${
                          (theme === "dark" ? darkColorIndex : lightColorIndex) === idx
                            ? "border-[hsl(var(--primary))] scale-110 ring-2 ring-[hsl(var(--primary))]"
                            : "border-[hsl(var(--obsidian-border))] opacity-80 hover:scale-105 hover:opacity-100"
                        }`}
                        style={{ background: `hsl(${color.primary})` }}
                        aria-label={color.name}
                        onClick={() => theme === "dark" ? handleDarkColorSelect(idx) : handleLightColorSelect(idx)}
                        type="button"
                      >
                        {(theme === "dark" ? darkColorIndex : lightColorIndex) === idx && (
                          <span className="block w-3 h-3 rounded-full bg-white/80 border border-white shadow-inner" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}

// Cabinet Information Component
function CabinetInformation({ vault }: { vault: Vault }) {
  return (
    <Card className="bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[hsl(var(--obsidian-text))]">
          <User className="h-4 w-4" />
          Workspace information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[hsl(var(--obsidian-text-muted))]">Workspace name</span>
          <span className="text-sm text-[hsl(var(--obsidian-text))] font-mono">{vault.name}</span>
        </div>
        <p className="text-xs text-muted-foreground">This workspace is saved only in this browser. Use a live session link—not the browser route—to invite collaborators.</p>
      </CardContent>
    </Card>
  );
}

// Main Dialog Component
interface VaultSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vault: Vault;
}

export default function VaultSettingsDialog({
  open,
  onOpenChange,
  vault,
}: VaultSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[hsl(var(--obsidian-text))]">
            <Settings className="h-5 w-5" />
            Workspace settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <AppearanceSettings />
          <CabinetInformation vault={vault} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
