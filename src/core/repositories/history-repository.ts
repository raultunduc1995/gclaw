import { ContentBlockParam } from "../../google-genai/index.js";
import type { HistoryResource, HistoryEntry } from "./resources/history.js";

export interface HistoryRepository {
  addMessage(chatJid: string, role: string, parts: Array<ContentBlockParam>): void;
  getHistory(chatJid: string, limit?: number): Array<HistoryEntry>;
  clearHistory(chatJid: string): void;
}

export interface HistoryRepositoryDeps {
  historyResource: HistoryResource;
}

export const createHistoryRepository = (deps: HistoryRepositoryDeps): HistoryRepository => {
  const addMessage = (chatJid: string, role: string, parts: Array<ContentBlockParam>): void => {
    deps.historyResource.addMessage(chatJid, role, parts);
  };

  const getHistory = (chatJid: string, limit?: number): Array<HistoryEntry> => {
    return deps.historyResource.getHistory(chatJid, limit);
  };

  const clearHistory = (chatJid: string): void => {
    deps.historyResource.clearHistory(chatJid);
  };

  return {
    addMessage,
    getHistory,
    clearHistory,
  };
};
