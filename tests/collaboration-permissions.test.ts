import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";

import { canEditSession } from "../client/src/lib/private-collab.ts";
import {
  addMarkdownNote,
  assertWorkspaceWithinScopes,
  moveNote,
  readCabinetNotes,
  renameNote,
} from "../client/src/lib/cabinet-files.ts";

test("two edit peers receive structural state while view access stays read-only", () => {
  const owner = new Y.Doc();
  const editPeerOne = new Y.Doc();
  const editPeerTwo = new Y.Doc();
  const viewPeer = new Y.Doc();
  const id = addMarkdownNote(owner, { filename: "AGENTS.md", path: ".agents", content: "rules" });

  for (const peer of [editPeerOne, editPeerTwo, viewPeer]) {
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(owner));
  }
  renameNote(editPeerOne, id, "RULES.md");
  moveNote(editPeerOne, id, ".agents/team");
  Y.applyUpdate(owner, Y.encodeStateAsUpdate(editPeerOne));
  const ownerUpdate = Y.encodeStateAsUpdate(owner);
  Y.applyUpdate(editPeerTwo, ownerUpdate);
  Y.applyUpdate(viewPeer, ownerUpdate);

  assert.equal(readCabinetNotes(editPeerTwo)[0].filename, "RULES.md");
  assert.equal(readCabinetNotes(viewPeer)[0].path, ".agents/team/");
  assert.doesNotThrow(() => assertWorkspaceWithinScopes(owner, [".agents"]));
  assert.equal(canEditSession("edit"), true);
  assert.equal(canEditSession("view"), false);
});

test("peer-editable Yjs metadata cannot broaden owner-selected sync scopes", () => {
  const owner = new Y.Doc();
  addMarkdownNote(owner, { filename: "SECRET.md", path: "outside", content: "no" });
  owner.getMap("meta").set("selectedScopes", ["outside"]);
  assert.throws(() => assertWorkspaceWithinScopes(owner, [".agents"]), /outside the shared workspace scopes/);
});
