import path from "path";
import { GROUPS_DIR, logger } from "../../core/utils/index.js";
import { BashTool } from "./bash-tool.js";
import { TextEditorTool } from "./text-editor-tool.js";
import type { SqliteRepository } from "../../core/repositories/index.js";
import { createUrlContextTool, type UrlContextTool } from "./url-context-tool.js";
import { allDeclarations } from "./tools-definitions.js";

export { BashTool, TextEditorTool, type UrlContextTool, createUrlContextTool, allDeclarations };

export interface AgentTools {
  execute(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

export const createAgentTools = async (groupFolder: string, chatJid: string, repository: SqliteRepository): Promise<AgentTools> => {
  const groupPath = path.resolve(GROUPS_DIR, groupFolder);

  let bash: BashTool | null = BashTool.init(groupPath);
  const textEditor: TextEditorTool = TextEditorTool.init(groupPath);
  const urlContext: UrlContextTool = createUrlContextTool();

  const execute = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    logger.info({ name, args, groupFolder }, "Executing agent tool");

    try {
      if (name === "bash") {
        const command = args.command as string;
        const restart = args.restart as boolean | undefined;
        const result = await bash!.execute({ command, restart });
        return { result };
      }

      if (name === "text_editor") {
        const result = await textEditor!.execute(args);
        return { result };
      }

      if (name === "fetch_url_context") {
        const url = args.url as string;
        const query = args.query as string;
        const result = await urlContext!.execute({ url, query });
        return { result };
      }
      if (name === "schedule_reminder") {
        const description = args.description as string;
        const triggerAt = args.trigger_at as string;

        repository.reminders.create(chatJid, triggerAt, description);
        return { result: `Reminder successfully scheduled for ${triggerAt}` };
      }

      return { error: `Tool ${name} is not implemented.` };
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : String(error);
      logger.error({ name, args, err: errMessage }, "Tool execution crashed");
      return { error: errMessage };
    }
  };

  const close = async (): Promise<void> => {
    logger.info({ groupFolder }, "Closing active agent tools...");
    if (bash) {
      bash.close();
      bash = null;
    }
  };

  return {
    execute,
    close,
  };
};
