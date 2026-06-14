import path from "path";
import { GROUPS_DIR, logger, MCP_AUTH_SECRET } from "../../core/utils/index.js";
import {} from "../../core/utils/config.js";
import { BashTool } from "./bash-tool.js";
import { McpClientManager } from "./mcp-client.js";
import { TextEditorTool } from "./text-editor-tool.js";
import { functionDeclarations } from "./tools-definitions.js";
import { createUrlContextTool, type UrlContextTool } from "./url-context-tool.js";

export { BashTool, McpClientManager, TextEditorTool, type UrlContextTool, createUrlContextTool, functionDeclarations };

export interface AgentTools {
  execute(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

const isEnabled = (name: string): boolean => {
  return functionDeclarations.some((decl) => decl.name === name);
};

export const createAgentTools = async (groupFolder: string): Promise<AgentTools> => {
  const groupPath = path.resolve(GROUPS_DIR, groupFolder);

  let bash: BashTool | null = null;
  let textEditor: TextEditorTool | null = null;
  let urlContext: UrlContextTool | null = null;
  let mcpManager: McpClientManager | null = null;

  if (isEnabled("bash")) {
    bash = BashTool.init(groupPath);
  }

  if (isEnabled("text_editor")) {
    textEditor = TextEditorTool.init(groupPath);
  }

  if (isEnabled("fetch_url_context")) {
    urlContext = createUrlContextTool();
  }

  if (isEnabled("mcp_bash") || isEnabled("mcp_text_editor")) {
    mcpManager = new McpClientManager();
    await mcpManager.connect({
      "work-mac": {
        url: "http://192.168.1.176:3737/sse",
        headers: { "X-Auth": MCP_AUTH_SECRET },
      },
    });
  }

  const execute = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    if (!isEnabled(name)) {
      return { error: `Tool '${name}' is disabled by configuration.` };
    }

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

      if (name === "mcp_bash" || name === "mcp_text_editor") {
        const result = await mcpManager!.callTool(name, args);
        return { result };
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
    if (mcpManager) {
      await mcpManager.close();
      mcpManager = null;
    }
  };

  return {
    execute,
    close,
  };
};
