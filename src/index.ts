import type { Hooks, Plugin } from "@opencode-ai/plugin"
import { execSync } from "child_process"

const ENV_VAR_RE = /^([A-Za-z_][A-Za-z0-9_]*=[^\s]* +)*/
const UNPROXYABLE_COMMANDS = new Set([
  "cd", "source", ".", "export", "alias", "unset", "set", "shopt", "eval", "exec",
])
const OPERATOR_RE = /(\s*(?:&&|\|\||;|\|)\s*|\s&\s?)/

// Resolve snip binary path once at module load to avoid exposing "snip"
// as a bare word in rewritten commands (prevents LLM token contamination).
export let snipBin: string
try {
  snipBin = execSync("command -v snip", { encoding: "utf-8" }).trim()
} catch {
  snipBin = "snip"
}

function snipCommand(command: string): string {
  const envPrefix = (command.match(ENV_VAR_RE) ?? [""])[0]
  const bareCmd = command.slice(envPrefix.length).trim()
  if (!bareCmd) return command
  if (UNPROXYABLE_COMMANDS.has(bareCmd.split(/\s+/)[0])) return command
  return `${envPrefix}${snipBin} ${bareCmd}`
}

export const toolExecuteBefore: NonNullable<Hooks["tool.execute.before"]> = async (input, output) => {
  if (input.tool !== "bash") return

  const command = output.args.command
  if (!command || typeof command !== "string") return
  if (command.startsWith("snip ") || command.startsWith(snipBin + " ")) return

  const segments = command.split(OPERATOR_RE)

  if (segments.length === 1) {
    output.args.command = snipCommand(command)
    return
  }

  output.args.command = segments
    .map((segment) => OPERATOR_RE.test(segment) ? segment : snipCommand(segment))
    .join("")
}

export const SnipPlugin: Plugin = async () => {
  return {
    "tool.execute.before": toolExecuteBefore,
  }
}

export default SnipPlugin
