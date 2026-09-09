import { type FunctionDeclaration, Type } from "@google/genai";

export const allDeclarations: FunctionDeclaration[] = [
  {
    name: "bash",
    description: "Execute a single bash command string on the local server.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: {
          type: Type.STRING,
          description: "The exact bash command line to run.",
        },
        restart: {
          type: Type.BOOLEAN,
          description: "Whether to restart the bash session (clearing all context) before executing this command.",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "text_editor",
    description: "Executes a text editor command such as view, replace_lines, create, or insert on a specified file path.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: {
          type: Type.STRING,
          description: "The type of editor command to execute.",
          enum: ["view", "replace_lines", "create", "insert"],
        },
        path: {
          type: Type.STRING,
          description: "The file system path where the command should be executed.",
        },
        view_range: {
          type: Type.ARRAY,
          description: "Optional: A tuple containing the starting and ending line numbers to view [start, end]. Only used with 'view' command.",
          items: {
            type: Type.INTEGER,
          },
          minItems: "2",
          maxItems: "2",
        },
        new_str: {
          type: Type.STRING,
          description: "The text content to replace the specified lines with. Required only for 'replace_lines' command.",
        },
        replace_range: {
          type: Type.ARRAY,
          description: "A tuple containing the starting and ending line numbers to replace [start, end]. Required only for 'replace_lines' command.",
          items: {
            type: Type.INTEGER,
          },
          minItems: "2",
          maxItems: "2",
        },
        file_text: {
          type: Type.STRING,
          description: "The initial text content for creating a file. Required only for 'create' command.",
        },
        insert_line: {
          type: Type.INTEGER,
          description: "The line number where text should be inserted. Required only for 'insert' command.",
        },
        insert_text: {
          type: Type.STRING,
          description: "The text content to insert. Required only for 'insert' command.",
        },
      },
      required: ["command", "path"],
    },
  },
  {
    name: "fetch_url_context",
    description: "Browse a specific URL and extract targeted information based on custom instructions or questions.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: {
          type: Type.STRING,
          description: "The full web URL to browse.",
        },
        query: {
          type: Type.STRING,
          description: "Specific questions, focus areas, or instructions on what exact information to extract from the page.",
        },
      },
      required: ["url", "query"],
    },
  },
  {
    name: "schedule_reminder",
    description: "Schedule a future reminder for the user. Gemini will send the description back into the chat at the exact specified time.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        description: {
          type: Type.STRING,
          description: "The instruction or message content for the reminder.",
        },
        trigger_at: {
          type: Type.STRING,
          description: "The exact ISO 8601 timestamp when the reminder should fire (e.g. '2026-06-26T09:00:00.000Z').",
        },
      },
      required: ["description", "trigger_at"],
    },
  },
];
