import { describe, it, expect, beforeEach } from "vitest"
import { toolExecuteBefore, snipBin } from "./index"

describe("toolExecuteBefore", () => {
  let mockInput: { tool: string; sessionID: string; callID: string }
  let mockOutput: { args: { command: string } }

  beforeEach(() => {
    mockInput = { tool: "bash", sessionID: "s", callID: "c" }
    mockOutput = { args: { command: "" } }
  })

  it("should use absolute path for snip binary", () => {
    // snipBin should be an absolute path, not bare "snip"
    // (unless snip is not installed, in which case it falls back)
    if (snipBin !== "snip") {
      expect(snipBin).toMatch(/^\//)
    }
  })

  it("should prefix simple command with snip absolute path", async () => {
    mockOutput.args.command = "go test ./..."
    await toolExecuteBefore(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe(`${snipBin} go test ./...`)
  })

  it("should handle command with one env var prefix", async () => {
    mockOutput.args.command = "CGO_ENABLED=0 go test ./..."
    await toolExecuteBefore(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe(`CGO_ENABLED=0 ${snipBin} go test ./...`)
  })

  it("should handle command with multiple env var prefixes", async () => {
    mockOutput.args.command = "CGO_ENABLED=0 GOOS=linux go test ./..."
    await toolExecuteBefore(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe(`CGO_ENABLED=0 GOOS=linux ${snipBin} go test ./...`)
  })

  it("should handle command with &&", async () => {
    mockOutput.args.command = "go test && go build"
    await toolExecuteBefore(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe(`${snipBin} go test && ${snipBin} go build`)
  })

  it("should handle command with |", async () => {
    mockOutput.args.command = "git log | head"
    await toolExecuteBefore(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe(`${snipBin} git log | ${snipBin} head`)
  })

  it("should handle command with ;", async () => {
    mockOutput.args.command = "go test; go build"
    await toolExecuteBefore(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe(`${snipBin} go test; ${snipBin} go build`)
  })

  it("should handle command with ||", async () => {
    mockOutput.args.command = "test -f foo.txt || echo missing"
    await toolExecuteBefore(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe(`${snipBin} test -f foo.txt || ${snipBin} echo missing`)
  })

  it("should handle command with &", async () => {
    mockOutput.args.command = "sleep 1 & sleep 2 &"
    await toolExecuteBefore(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe(`${snipBin} sleep 1 & ${snipBin} sleep 2 &`)
  })

  it("should handle mixed operators", async () => {
    mockOutput.args.command = "go test && go build; go run"
    await toolExecuteBefore(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe(`${snipBin} go test && ${snipBin} go build; ${snipBin} go run`)
  })

  it("should handle env vars with operators", async () => {
    mockOutput.args.command = "FOO=bar go test && go build"
    await toolExecuteBefore(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe(`FOO=bar ${snipBin} go test && ${snipBin} go build`)
  })

  it("should not double prefix already prefixed command (bare)", async () => {
    mockOutput.args.command = "snip go test"
    await toolExecuteBefore(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe("snip go test")
  })

  it("should not double prefix already prefixed command (absolute path)", async () => {
    mockOutput.args.command = `${snipBin} go test`
    await toolExecuteBefore(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe(`${snipBin} go test`)
  })

  it("should not modify non-bash tool calls", async () => {
    mockInput.tool = "read"
    mockOutput.args.command = "go test"
    await toolExecuteBefore(mockInput, mockOutput)
    expect(mockOutput.args.command).toBe("go test")
  })

  it("should not contain bare 'snip' word in rewritten command", async () => {
    mockOutput.args.command = "git status"
    await toolExecuteBefore(mockInput, mockOutput)
    // The rewritten command should use the resolved path, not bare "snip"
    if (snipBin !== "snip") {
      expect(mockOutput.args.command).not.toMatch(/(?:^|\s)snip\s/)
    }
  })

  describe("unproxyable shell builtins", () => {
    it("should skip cd", async () => {
      mockOutput.args.command = "cd /tmp"
      await toolExecuteBefore(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("cd /tmp")
    })

    it("should skip source", async () => {
      mockOutput.args.command = "source ~/.bashrc"
      await toolExecuteBefore(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("source ~/.bashrc")
    })

    it("should skip . (dot)", async () => {
      mockOutput.args.command = ". ./env.sh"
      await toolExecuteBefore(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe(". ./env.sh")
    })

    it("should skip export", async () => {
      mockOutput.args.command = "export FOO=bar"
      await toolExecuteBefore(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("export FOO=bar")
    })

    it("should skip alias", async () => {
      mockOutput.args.command = 'alias ll="ls -la"'
      await toolExecuteBefore(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe('alias ll="ls -la"')
    })

    it("should skip unset", async () => {
      mockOutput.args.command = "unset VAR"
      await toolExecuteBefore(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("unset VAR")
    })

    it("should skip export with env var prefix", async () => {
      mockOutput.args.command = "CGO_ENABLED=0 export FOO=bar"
      await toolExecuteBefore(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe("CGO_ENABLED=0 export FOO=bar")
    })

    it("should skip cd but snip chained command", async () => {
      mockOutput.args.command = "cd /tmp && ls"
      await toolExecuteBefore(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe(`cd /tmp && ${snipBin} ls`)
    })
  })

  describe("redirections with &", () => {
    it("should not break 2>&1 redirection", async () => {
      mockOutput.args.command = "find / -name \"*.log\" 2>&1"
      await toolExecuteBefore(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe(`${snipBin} find / -name "*.log" 2>&1`)
    })

    it("should not break 1>&2 redirection", async () => {
      mockOutput.args.command = "cmd 1>&2"
      await toolExecuteBefore(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe(`${snipBin} cmd 1>&2`)
    })

    it("should handle 2>&1 with pipe", async () => {
      mockOutput.args.command = "find / -name \"*.log\" 2>&1 | grep error"
      await toolExecuteBefore(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe(`${snipBin} find / -name "*.log" 2>&1 | ${snipBin} grep error`)
    })

    it("should handle 2>&1 with chained commands", async () => {
      mockOutput.args.command = "cmd1 2>&1 && cmd2"
      await toolExecuteBefore(mockInput, mockOutput)
      expect(mockOutput.args.command).toBe(`${snipBin} cmd1 2>&1 && ${snipBin} cmd2`)
    })
  })
})
