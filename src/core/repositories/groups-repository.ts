import fs from "fs";
import path from "path";
import { GROUPS_DIR } from "../utils/index.js";
import type { GroupResource, RegisteredGroup } from "./resources/group.js";

export interface GroupsRepository {
  registerGroup(jid: string, name: string, folder: string): RegisteredGroup;
  getGroups(): Record<string, RegisteredGroup>;
}

export interface GroupsRepositoryDeps {
  groupsResource: GroupResource;
}

export const createGroupsRepository = (deps: GroupsRepositoryDeps): GroupsRepository => {
  const registerGroup = (jid: string, name: string, folder: string): RegisteredGroup => {
    // 1. Persist in database
    const group = deps.groupsResource.registerGroup(jid, name, folder);

    // 2. Perform domain side-effect: create group directory immediately
    const groupPath = path.resolve(GROUPS_DIR, folder);
    if (!fs.existsSync(groupPath)) {
      fs.mkdirSync(groupPath, { recursive: true });
    }

    // 3. Create memories directory inside the group folder
    const memoriesPath = path.resolve(groupPath, "memories");
    if (!fs.existsSync(memoriesPath)) {
      fs.mkdirSync(memoriesPath, { recursive: true });
    }

    // 4. Provision default index.md inside memories folder if it doesn't exist
    const indexPath = path.resolve(memoriesPath, "index.md");
    if (!fs.existsSync(indexPath)) {
      const defaultIndexContent = [
        "# Memory Vault Index",
        "*An indexed registry of permanent memory files, specifications, and project assets.*",
        "",
        "| File Name | Description | Tags | Last Updated |",
        "| :--- | :--- | :--- | :--- |",
        "",
      ].join("\n");
      fs.writeFileSync(indexPath, defaultIndexContent, "utf8");
    }

    // 5. Provision default context.md under the group folder root (excluded from memories) if it doesn't exist
    const contextPath = path.resolve(memoriesPath, "context.md");
    if (!fs.existsSync(contextPath)) {
      const defaultContextContent = ["# Relational Context", "*Local preferences and specifications for this chat group.*", ""].join("\n");
      fs.writeFileSync(contextPath, defaultContextContent, "utf8");
    }

    return group;
  };

  const getGroups = (): Record<string, RegisteredGroup> => {
    return deps.groupsResource.getGroups();
  };

  return {
    registerGroup,
    getGroups,
  };
};
