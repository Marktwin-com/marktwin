import type { WorkspaceActivity, WorkspaceActivityCode } from "@shared/schema";

const activityKeys: Record<WorkspaceActivityCode, string> = {
  "file.created": "activity.fileCreated",
  "folder.created": "activity.folderCreated",
  "folder.moved": "activity.folderMoved",
  "decision.captured": "activity.decisionCaptured",
  "file.moved": "activity.fileMoved",
  "file.renamed": "activity.fileRenamed",
  "file.deleted": "activity.fileDeleted",
  "folder.contents_deleted": "activity.folderContentsDeleted",
};

export function workspaceActivityPresentation(activity: WorkspaceActivity) {
  if (!activity.operationCode) return { legacy: activity.operation || null };
  return { key: activityKeys[activity.operationCode], params: activity.params };
}
