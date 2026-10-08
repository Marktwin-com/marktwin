import type { FolderRecord, ScopeContent, WorkspaceNote } from "./cabinet-files";
import { fullNotePath, normalizeRepositoryPath, pathBelongsToScope } from "./cabinet-files";
import type { SavedRepoLocal } from "./saved-repos";
import type { GitHubCommitSummary, GitHubWorkspaceFile, WorkspaceFileType } from "./workspace-github";

export const DEMO_WORKSPACE_ID = -20260814;
export const DEMO_WORKSPACE_VERSION = 3;
export const DEMO_WORKSPACE_BRANCH = `bundled-demo-v${DEMO_WORKSPACE_VERSION}`;
export const LEGACY_DEMO_WORKSPACE_BRANCH = "bundled-demo-v1";
export const DEMO_WORKSPACE_SCOPES = ["/", "examples", "guides"];
export type DemoWorkspaceAccess = "editable" | "read-only";
export type DemoScenarioId = "decision" | "research" | "planning";

export interface DemoScenario {
  id: DemoScenarioId;
  title: string;
  description: string;
  repository: SavedRepoLocal;
}

export const DEMO_REPOSITORY: SavedRepoLocal = Object.freeze({
  id: DEMO_WORKSPACE_ID,
  cabinetNumber: 1,
  displayName: "Marktwin Tutorial",
  repoFullName: "Marktwin/browser-demo",
  defaultBranch: DEMO_WORKSPACE_BRANCH,
  selectedRootScopes: DEMO_WORKSPACE_SCOPES,
  selectedFileTypes: ["markdown", "canvas", "drawing"],
  autoSync: false,
  autoMergeNonOverlapping: true,
  createConflictBackup: true,
  pendingConflictBackupBranches: [],
  createdAt: "2026-08-14T00:00:00.000Z",
});

// Internal recording fixtures, deliberately absent from public navigation.
// See VALIDATION.md for the stable URLs and recommended video flow.
export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "decision",
    title: "Make a difficult decision",
    description: "Compare evidence, alternatives, and risks before making a decision your team can revisit.",
    repository: Object.freeze({
      ...DEMO_REPOSITORY,
      id: -20260815,
      displayName: "Demo: Difficult decision",
      repoFullName: "Marktwin/demo-difficult-decision",
      defaultBranch: "bundled-decision-v1",
      selectedRootScopes: ["/", "evidence"],
    }),
  },
  {
    id: "research",
    title: "Research something complex",
    description: "Turn raw material and open questions into structured notes, a map, and a conclusion.",
    repository: Object.freeze({
      ...DEMO_REPOSITORY,
      id: -20260816,
      displayName: "Demo: Complex research",
      repoFullName: "Marktwin/demo-complex-research",
      defaultBranch: "bundled-research-v1",
      selectedRootScopes: ["/", "sources"],
    }),
  },
  {
    id: "planning",
    title: "Plan a project with others",
    description: "Bring a brief, milestones, risks, Chat, and a shared Canvas into one working context.",
    repository: Object.freeze({
      ...DEMO_REPOSITORY,
      id: -20260817,
      displayName: "Demo: Collaborative planning",
      repoFullName: "Marktwin/demo-collaborative-planning",
      defaultBranch: "bundled-planning-v1",
      selectedRootScopes: ["/", "project"],
    }),
  },
];

export function getDemoScenario(id: string | null | undefined): DemoScenario | null {
  return DEMO_SCENARIOS.find((scenario) => scenario.id === id) || null;
}

const README = `# Welcome to Marktwin

This is a complete Marktwin workspace stored only in your browser. It is both a tutorial and a safe place to try the product.

> [!TIP]
> Edit anything. Open a live collaboration session, create files, draw, or rearrange the canvas. Use **Reset Tutorial** whenever you want the original repository back.

## Start here

- [Write with the visual Markdown editor](MARKDOWN-EDITOR.md)
- [Work together privately](COLLABORATION.md)
- [Understand checkpoints and merge resolution](GITHUB-SYNC.md)
- Open [PROJECT-BOARD.canvas](examples/PROJECT-BOARD.canvas) to try cards, columns, file references, and arrows.
- Open [TEAM-SKETCH.excalidraw](examples/TEAM-SKETCH.excalidraw) to try simultaneous drawing.

## What to try

- [ ] Change this sentence in the visual editor.
- [ ] Open the same file in split view and give each pane a different view mode.
- [ ] Collapse a section from its heading.
- [ ] Open Chat and start a private edit session.
- [ ] Create a Markdown note, canvas, drawing, or folder.
- [ ] Review your staged changes using the checkpoint button.

## Your data in this Tutorial

The bundled repository does not connect to GitHub and does not need a token. Your changes and recovery copy stay in this browser. Collaboration is encrypted peer to peer and works while the Tutorial owner remains connected.
`;

const MARKDOWN_EDITOR = String.raw`# The Markdown editor

Marktwin always keeps exact Markdown as the shared source. **Visual**, **Source**, and Preview are three views of the same collaborative text.

## Inline formatting

Write **bold**, *italic*, ~~struck text~~, <u>underlined text</u>, <code>inline code</code>, and [links](https://github.com/).

Markdown markers stay hidden in the visual editor until your cursor enters the exact formatted passage. They never disappear from the underlying file, and Source always shows the literal Markdown.

## Lists and tasks

1. Select text.
2. Use the formatting toolbar.
3. Watch another participant receive the exact Markdown through Yjs.

- [x] Tables render as structured blocks.
- [ ] Task boxes remain editable.
- [ ] Undo and redo stay collaborative.

## Table

| View | Best for | Editable |
| --- | --- | --- |
| Visual | Everyday writing | Yes |
| Source | Exact Markdown | Yes |
| Preview | Reading the rendered result | No |

## Code

~~~ts
const sourceOfTruth = ydoc.getText("markdown");
console.log(sourceOfTruth.toString());
~~~

## Images

![A bundled Marktwin tutorial card](data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22640%22%20height=%22240%22%20viewBox=%220%200%20640%20240%22%3E%3Crect%20width=%22640%22%20height=%22240%22%20rx=%2224%22%20fill=%22%2327242c%22/%3E%3Ccircle%20cx=%2290%22%20cy=%22120%22%20r=%2252%22%20fill=%22%23a1286a%22/%3E%3Ctext%20x=%22170%22%20y=%22110%22%20font-size=%2236%22%20font-family=%22sans-serif%22%20fill=%22white%22%3EMarktwin%3C/text%3E%3Ctext%20x=%22170%22%20y=%22152%22%20font-size=%2222%22%20font-family=%22sans-serif%22%20fill=%22%23ddd6e1%22%3EWrite,%20draw,%20and%20decide%20together.%3C/text%3E%3C/svg%3E)

> [!IMPORTANT]
> Visual formatting is presentation. Marktwin publishes the original Markdown, not generated HTML.

<details>
<summary>Safe HTML can be useful</summary>

Details, summary, underline, superscript, and subscript are sanitized before rendering.

</details>

Here is a footnote.[^privacy]

[^privacy]: Private repository contents and GitHub credentials stay in the browser.
`;

const COLLABORATION = `# Private real-time collaboration

The owner can share an encrypted live session without uploading repository contents or a GitHub token to the Marktwin server.

## Try it

1. Select the Share icon.
2. Copy an edit or view-only link.
3. Open the link on another device.
4. Edit this file together, open Chat, or draw on the same Excalidraw note.

## Permissions

| Participant | Files | Chat | History | Publish |
| --- | --- | --- | --- | --- |
| Owner | Edit | Yes | Yes | Yes |
| Editor | Edit | Yes | No | No |
| Viewer | Read | Yes | No | No |

The owner browser sends the initial encrypted Yjs workspace to new peers. If the owner disconnects, new participants wait until the owner returns.

> [!NOTE]
> Appearance and editor preferences belong to each browser. One participant can use Source while another uses Visual or Preview.
`;

const GITHUB_SYNC = `# GitHub checkpoints and merge resolution

This browser Tutorial does not connect to GitHub. Its checkpoint flow lets you review staged work locally; a real Cabinet publishes the same reviewed changes atomically to its configured GitHub branch.

## Normal checkpoint

1. Edit files in Marktwin.
2. Select the checkpoint icon.
3. Review added, changed, moved, and deleted paths.
4. Publish the checkpoint in a real cabinet.

## When GitHub advanced

Marktwin compares four versions:

| View | Meaning |
| --- | --- |
| Base state | GitHub when editing began |
| Marktwin changes | Work in the collaborative browser workspace |
| GitHub changes | The newest branch contents |
| Result | What will be published |

Non-overlapping Markdown changes can merge automatically. Overlapping text, add/add, delete/modify, destination collisions, drawings, and canvases require an explicit choice.

> [!WARNING]
> A temporary backup branch is optional and is created only for genuine unresolved conflicts.
`;

const CANVAS_AND_DRAWING = `# Canvas and drawing

Marktwin supports two collaborative visual formats while keeping both as repository files.

## Canvas

Open **examples/PROJECT-BOARD.canvas**. You can:

- Write directly on cards and columns.
- Drag files from the explorer into the canvas.
- Connect cards with arrows.
- Move, resize, and recolor nodes.
- Select **See more** on a file card to open the referenced note.

## Drawing

Open **examples/TEAM-SKETCH.excalidraw**. You can:

- Draw simultaneously with another participant.
- Use mouse, trackpad, touch, Apple Pencil, or Wacom input.
- Change stroke width, color, pressure response, and smoothing.
- Insert images and use Excalidraw libraries.

Independent visual elements are stored under stable Yjs keys, so simultaneous changes merge without replacing the whole scene.
`;

const PROJECT_NOTE = `# Tutorial launch checklist

This Markdown note is referenced from the sample canvas.

- [x] Browser-local seed
- [x] Visual Markdown examples
- [x] Canvas and drawing examples
- [ ] Invite someone to test collaboration
`;

export const LEGACY_DEMO_PROJECT_BOARD = `${JSON.stringify({
  nodes: [
    { id: "a-column-learn", type: "text", x: 40, y: 40, width: 280, height: 360, text: "Learn Marktwin", color: "4" },
    { id: "b-card-markdown", type: "file", x: 70, y: 110, width: 220, height: 110, file: "MARKDOWN-EDITOR.md" },
    { id: "b-card-collab", type: "file", x: 70, y: 245, width: 220, height: 110, file: "COLLABORATION.md" },
    { id: "a-column-try", type: "text", x: 410, y: 40, width: 280, height: 360, text: "Try it together", color: "5" },
    { id: "b-card-checklist", type: "file", x: 440, y: 110, width: 220, height: 120, file: "examples/PROJECT-NOTE.md" },
    { id: "b-card-draw", type: "text", x: 440, y: 260, width: 220, height: 90, text: "Open TEAM-SKETCH.excalidraw and draw together" },
  ],
  edges: [
    { id: "edge-learn-try", fromNode: "b-card-markdown", fromSide: "right", toNode: "b-card-checklist", toSide: "left", toEnd: "arrow", label: "then practice" },
    { id: "edge-collab-draw", fromNode: "b-card-collab", fromSide: "right", toNode: "b-card-draw", toSide: "left", toEnd: "arrow", label: "invite a peer" },
  ],
}, null, 2)}\n`;

export const PROJECT_BOARD = `${JSON.stringify({
  nodes: [
    { id: "a-column-learn", type: "group", x: 40, y: 40, width: 320, height: 500, label: "Learn Marktwin", color: "4" },
    { id: "a-column-try", type: "group", x: 430, y: 40, width: 320, height: 500, label: "Try it together", color: "5" },
    { id: "b-card-markdown", type: "file", x: 64, y: 108, width: 272, height: 168, file: "MARKDOWN-EDITOR.md", marktwinColumnId: "a-column-learn" },
    { id: "b-card-collab", type: "file", x: 64, y: 300, width: 272, height: 168, file: "COLLABORATION.md", marktwinColumnId: "a-column-learn" },
    { id: "b-card-checklist", type: "file", x: 454, y: 108, width: 272, height: 168, file: "examples/PROJECT-NOTE.md", marktwinColumnId: "a-column-try" },
    { id: "b-card-draw", type: "text", x: 454, y: 300, width: 272, height: 150, text: "Open TEAM-SKETCH.excalidraw and draw together", marktwinColumnId: "a-column-try" },
  ],
  edges: [
    { id: "edge-learn-try", fromNode: "b-card-markdown", fromSide: "right", toNode: "b-card-checklist", toSide: "left", toEnd: "arrow", label: "then practice" },
    { id: "edge-collab-draw", fromNode: "b-card-collab", fromSide: "right", toNode: "b-card-draw", toSide: "left", toEnd: "arrow", label: "invite a peer" },
  ],
}, null, 2)}\n`;
export const DEMO_PROJECT_BOARD_SHA = `demo-v${DEMO_WORKSPACE_VERSION}-9`;

function drawingElementBase(id: string, index: string, seed: number, nonce: number) {
  return {
    id,
    index,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed,
    version: 1,
    versionNonce: nonce,
    isDeleted: false,
    boundElements: null,
    updated: 1786665600000,
    link: null,
    locked: false,
  };
}

const TEAM_SKETCH = `${JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "marktwin-demo",
  elements: [
    {
      ...drawingElementBase("welcome-card", "a0", 101, 1001),
      type: "rectangle",
      x: 100,
      y: 90,
      width: 420,
      height: 210,
      backgroundColor: "#d0ebff",
      roundness: { type: 3 },
    },
    {
      ...drawingElementBase("welcome-text", "a1", 102, 1002),
      type: "text",
      x: 150,
      y: 135,
      width: 320,
      height: 100,
      strokeWidth: 1,
      text: "Draw here together\nTry colors, arrows, images,\nand different stroke widths.",
      originalText: "Draw here together\nTry colors, arrows, images,\nand different stroke widths.",
      fontSize: 28,
      fontFamily: 5,
      textAlign: "center",
      verticalAlign: "middle",
      containerId: null,
      autoResize: true,
      lineHeight: 1.25,
    },
    {
      ...drawingElementBase("demo-arrow", "a2", 103, 1003),
      type: "arrow",
      x: 290,
      y: 340,
      width: 220,
      height: 90,
      points: [[0, 0], [220, 90]],
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: "arrow",
      elbowed: false,
    },
  ],
  appState: { viewBackgroundColor: "#ffffff", gridSize: null, gridStep: 5, gridModeEnabled: false },
  files: {},
}, null, 2)}\n`;

const DEMO_FILES: ReadonlyArray<Omit<GitHubWorkspaceFile, "sha">> = [
  { path: "README.md", name: "README.md", content: README, fileType: "markdown" },
  { path: "MARKDOWN-EDITOR.md", name: "MARKDOWN-EDITOR.md", content: MARKDOWN_EDITOR, fileType: "markdown" },
  { path: "COLLABORATION.md", name: "COLLABORATION.md", content: COLLABORATION, fileType: "markdown" },
  { path: "GITHUB-SYNC.md", name: "GITHUB-SYNC.md", content: GITHUB_SYNC, fileType: "markdown" },
  { path: "guides/CANVAS-AND-DRAWING.md", name: "CANVAS-AND-DRAWING.md", content: CANVAS_AND_DRAWING, fileType: "markdown" },
  { path: "examples/PROJECT-NOTE.md", name: "PROJECT-NOTE.md", content: PROJECT_NOTE, fileType: "markdown" },
  { path: "examples/PROJECT-BOARD.canvas", name: "PROJECT-BOARD.canvas", content: PROJECT_BOARD, fileType: "canvas" },
  { path: "examples/TEAM-SKETCH.excalidraw", name: "TEAM-SKETCH.excalidraw", content: TEAM_SKETCH, fileType: "drawing" },
];

const SCENARIO_FILES: Record<DemoScenarioId, ReadonlyArray<Omit<GitHubWorkspaceFile, "sha">>> = {
  decision: [
    { path: "README.md", name: "README.md", fileType: "markdown", content: "# Should we build this feature?\n\nStart with the evidence and compare alternatives before recording a conclusion in this note.\n\n- [Open the evidence](evidence/USER-RESEARCH.md)\n- [Open the decision canvas](DECISION-BOARD.canvas)\n" },
    { path: "evidence/USER-RESEARCH.md", name: "USER-RESEARCH.md", fileType: "markdown", content: "# User research\n\nFive interviews point to a recurring problem: people need a faster way to review changes before publishing.\n\n## Evidence\n\n- Reviewers lose context when changes are split across tools.\n- Most teams prefer a small, explicit checkpoint over automatic publishing.\n- The highest risk is adding a workflow that feels heavier than the problem.\n\n## Open question\n\nWould a lightweight review surface improve confidence without slowing down daily work?\n" },
    { path: "evidence/ALTERNATIVES.md", name: "ALTERNATIVES.md", fileType: "markdown", content: "# Alternatives\n\n## Build a review surface\n\nHigh confidence in the user problem. Moderate implementation cost.\n\n## Improve existing history\n\nLower cost, but may not address the context gap.\n\n## Do nothing\n\nNo implementation cost, but the current friction remains.\n" },
    { path: "DECISION-BOARD.canvas", name: "DECISION-BOARD.canvas", fileType: "canvas", content: JSON.stringify({ nodes: [
      { id: "decision-evidence", type: "file", x: 40, y: 80, width: 280, height: 180, file: "evidence/USER-RESEARCH.md" },
      { id: "decision-alternatives", type: "file", x: 380, y: 80, width: 280, height: 180, file: "evidence/ALTERNATIVES.md" },
      { id: "decision-question", type: "text", x: 720, y: 80, width: 280, height: 180, text: "What gives the team more confidence without adding ceremony?" },
    ], edges: [
      { id: "decision-edge-1", fromNode: "decision-evidence", toNode: "decision-question", toEnd: "arrow", label: "evidence" },
      { id: "decision-edge-2", fromNode: "decision-alternatives", toNode: "decision-question", toEnd: "arrow", label: "tradeoffs" },
    ] }, null, 2) + "\n" },
  ],
  research: [
    { path: "README.md", name: "README.md", fileType: "markdown", content: "# Research Cabinet\n\nFollow the trail from raw sources to a conclusion.\n\n- [Source notes](sources/SOURCE-NOTES.md)\n- [Questions](QUESTIONS.md)\n- [Synthesis](SYNTHESIS.md)\n- [Research map](RESEARCH-MAP.canvas)\n" },
    { path: "sources/SOURCE-NOTES.md", name: "SOURCE-NOTES.md", fileType: "markdown", content: "# Source notes\n\n## Source A\n\nSmall teams often know the next action but lose the reasoning that led there.\n\n## Source B\n\nA useful knowledge base should make context easier to recover, not only make documents easier to store.\n\n## Source C\n\nThe best structure is often discovered while working, not imposed before the first note exists.\n" },
    { path: "QUESTIONS.md", name: "QUESTIONS.md", fileType: "markdown", content: "# Questions\n\n- What helps someone return to a difficult problem?\n- Which relationships are worth keeping durable?\n- Where should search begin: filenames, text, or decisions?\n" },
    { path: "SYNTHESIS.md", name: "SYNTHESIS.md", fileType: "markdown", content: "# Synthesis\n\nA general knowledge base becomes useful when it helps a person recover the shape of a problem. Search, links, decisions, and favorites should reinforce one another.\n\n## Conclusion\n\nStart with retrieval and context, then add automation only where it protects human judgment.\n" },
    { path: "RESEARCH-MAP.canvas", name: "RESEARCH-MAP.canvas", fileType: "canvas", content: JSON.stringify({ nodes: [
      { id: "research-source", type: "file", x: 60, y: 80, width: 280, height: 180, file: "sources/SOURCE-NOTES.md" },
      { id: "research-questions", type: "file", x: 400, y: 80, width: 280, height: 180, file: "QUESTIONS.md" },
      { id: "research-synthesis", type: "file", x: 740, y: 80, width: 280, height: 180, file: "SYNTHESIS.md" },
    ], edges: [
      { id: "research-edge-1", fromNode: "research-source", toNode: "research-questions", toEnd: "arrow" },
      { id: "research-edge-2", fromNode: "research-questions", toNode: "research-synthesis", toEnd: "arrow" },
    ] }, null, 2) + "\n" },
  ],
  planning: [
    { path: "README.md", name: "README.md", fileType: "markdown", content: "# Collaborative planning\n\nA project plan is more useful when the brief, risks, milestones, and decisions stay connected.\n\n- [Project brief](project/BRIEF.md)\n- [Risks](project/RISKS.md)\n- [Planning board](project/PLANNING-BOARD.canvas)\n" },
    { path: "project/BRIEF.md", name: "BRIEF.md", fileType: "markdown", content: "# Project brief\n\n## Outcome\n\nHelp a small team ship a focused first release without losing the reasoning behind its tradeoffs.\n\n## Next checkpoint\n\nAgree on the smallest useful slice, then review it together before implementation.\n" },
    { path: "project/RISKS.md", name: "RISKS.md", fileType: "markdown", content: "# Risks\n\n- The scope grows faster than the evidence.\n- Ownership is unclear after the planning session.\n- Decisions remain in Chat instead of becoming durable context.\n" },
    { path: "project/PLANNING-BOARD.canvas", name: "PLANNING-BOARD.canvas", fileType: "canvas", content: JSON.stringify({ nodes: [
      { id: "planning-now", type: "group", x: 40, y: 40, width: 320, height: 420, label: "Now" },
      { id: "planning-next", type: "group", x: 420, y: 40, width: 320, height: 420, label: "Next" },
      { id: "planning-brief", type: "file", x: 70, y: 120, width: 260, height: 170, file: "project/BRIEF.md", marktwinColumnId: "planning-now" },
      { id: "planning-risks", type: "file", x: 450, y: 120, width: 260, height: 170, file: "project/RISKS.md", marktwinColumnId: "planning-next" },
      { id: "planning-checkpoint", type: "text", x: 450, y: 320, width: 260, height: 100, text: "Review the smallest useful slice together", marktwinColumnId: "planning-next" },
    ], edges: [{ id: "planning-edge", fromNode: "planning-brief", toNode: "planning-risks", toEnd: "arrow", label: "review" }] }, null, 2) + "\n" },
  ],
};

function cloneFile(file: Omit<GitHubWorkspaceFile, "sha">, index: number): GitHubWorkspaceFile {
  return { ...file, sha: `demo-v${DEMO_WORKSPACE_VERSION}-${index + 1}` };
}

/**
 * Assign a path to the most specific selected scope. The repository root is
 * allowed to contain nested paths for edits, but a root plus a selected folder
 * must not duplicate that folder in a demo seed or checkpoint.
 */
function pathBelongsToDemoScope(path: string, scope: string, scopes: string[]) {
  const normalized = normalizeRepositoryPath(path);
  const matchingScopes = scopes
    .filter((candidate) => pathBelongsToScope(normalized, candidate))
    .sort((left, right) => {
      if (left === "/") return -1;
      if (right === "/") return 1;
      return right.length - left.length;
    });
  return matchingScopes[0] === scope;
}

export function createBundledDemoScopes(): ScopeContent[] {
  const files = DEMO_FILES.map(cloneFile);
  return DEMO_WORKSPACE_SCOPES.map((scope) => ({
    scope,
    files: files.filter((file) => pathBelongsToDemoScope(file.path, scope, DEMO_WORKSPACE_SCOPES)),
    folderMarkers: [],
  }));
}

export function createScenarioDemoScopes(id: DemoScenarioId): ScopeContent[] {
  const files = SCENARIO_FILES[id].map(cloneFile);
  const scopes = getDemoScenario(id)?.repository.selectedRootScopes || ["/"];
  return scopes.map((scope) => ({
    scope,
    files: files.filter((file) => pathBelongsToDemoScope(file.path, scope, scopes)),
    folderMarkers: [],
  }));
}

/** Update untouched bundled files while preserving anything the visitor edited. */
export function migrateLegacyDemoScopes(scopes: ScopeContent[]): ScopeContent[] {
  return scopes.map((scope) => ({
    ...scope,
    files: scope.files.map((file) => (
      file.path === "examples/PROJECT-BOARD.canvas" && file.content === LEGACY_DEMO_PROJECT_BOARD
        ? { ...file, content: PROJECT_BOARD, sha: DEMO_PROJECT_BOARD_SHA }
        : file
    )),
  }));
}

export function createDemoCheckpointScopes(
  notes: WorkspaceNote[],
  folders: FolderRecord[],
  scopes = DEMO_WORKSPACE_SCOPES,
): ScopeContent[] {
  return scopes.map((scope) => ({
    scope,
    files: notes
      .filter((note) => pathBelongsToScope(fullNotePath(note), scope))
      .filter((note) => pathBelongsToDemoScope(fullNotePath(note), scope, scopes))
      .map((note) => ({
        path: fullNotePath(note),
        name: note.filename,
        sha: note.githubSha || `demo-local-${note.id}`,
        content: note.content,
        fileType: note.fileType,
      })),
    folderMarkers: folders
      .filter((folder) => pathBelongsToScope(`${folder.path}/.gitkeep`, scope))
      .filter((folder) => pathBelongsToDemoScope(`${folder.path}/.gitkeep`, scope, scopes))
      .map((folder) => folder.path),
  }));
}

export const DEMO_HISTORY: GitHubCommitSummary[] = [
  {
    sha: "demo0003browserworkspace",
    shortSha: "demo003",
    message: "Run the documentation as a browser-local workspace",
    author: "Marktwin",
    authoredAt: "2026-08-14T16:00:00.000Z",
    url: "",
  },
  {
    sha: "demo0002drawingcanvas",
    shortSha: "demo002",
    message: "Add collaborative canvas and drawing examples",
    author: "Marktwin",
    authoredAt: "2026-08-13T14:00:00.000Z",
    url: "",
  },
  {
    sha: "demo0001tutorial",
    shortSha: "demo001",
    message: "Create the interactive Marktwin tutorial",
    author: "Marktwin",
    authoredAt: "2026-08-12T10:00:00.000Z",
    url: "",
  },
];

export const DEMO_FILE_TYPES: WorkspaceFileType[] = ["markdown", "canvas", "drawing"];
