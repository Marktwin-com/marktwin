import * as Y from "yjs";

export const COLLABORATION_EDITOR_RECOVERY_EVENT = "marktwin:collaboration-editor-recovery";

/**
 * Validate a received Yjs update before applying it to the live document.
 *
 * Yjs observers run synchronously inside applyUpdate. A rendering observer such
 * as CodeMirror can fail while reconciling a remote selection even though the
 * authenticated update itself is valid and has already reached the Y.Doc. That
 * UI failure must remount the editor; it must not be misclassified as malicious
 * encrypted traffic and tear down an otherwise healthy WebRTC data channel.
 */
export function applyCollaborationUpdate(doc: Y.Doc, update: Uint8Array, origin: unknown) {
  // Parsing errors still escape to the data-channel validation boundary, which
  // closes a peer that sent malformed update bytes.
  Y.decodeUpdate(update);
  try {
    Y.applyUpdate(doc, update, origin);
  } catch (error) {
    console.warn("A collaboration editor observer failed; remounting from the synchronized Yjs document.", error);
    if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(COLLABORATION_EDITOR_RECOVERY_EVENT, { detail: doc }));
    }
  }
}
