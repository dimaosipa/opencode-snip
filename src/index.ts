import type { Plugin } from "@opencode-ai/plugin"

export const SnipPlugin: Plugin = async () => {
  return {
    "tool.execute.before": async (input, output) => {

      if (input.tool !== "bash") return
      const command = output.args.command;
      if (!command || typeof command !== "string") return

      if (command.startsWith("snip ")) return

      output.args.command = `snip ${command}`
    }
  }
}

export default SnipPlugin
