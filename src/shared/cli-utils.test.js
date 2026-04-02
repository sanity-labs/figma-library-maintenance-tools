import { describe, it, expect } from "vitest";
import {
  parseCliArgs,
  formatReport,
  getEffectiveFileKey,
} from "./cli-utils.js";

describe("parseCliArgs", () => {
  it("parses --file-key and --token flags", () => {
    const config = parseCliArgs(["--file-key", "abc123", "--token", "tok456"]);
    expect(config.fileKey).toBe("abc123");
    expect(config.accessToken).toBe("tok456");
  });

  it("parses short flags -f and -t", () => {
    const config = parseCliArgs(["-f", "abc123", "-t", "tok456"]);
    expect(config.fileKey).toBe("abc123");
    expect(config.accessToken).toBe("tok456");
  });

  it("falls back to environment variables", () => {
    const env = { FIGMA_FILE_KEY: "envFile", FIGMA_ACCESS_TOKEN: "envToken" };
    const config = parseCliArgs([], env);
    expect(config.fileKey).toBe("envFile");
    expect(config.accessToken).toBe("envToken");
  });

  it("CLI flags override environment variables", () => {
    const env = { FIGMA_FILE_KEY: "envFile", FIGMA_ACCESS_TOKEN: "envToken" };
    const config = parseCliArgs(["-f", "cliFile", "-t", "cliToken"], env);
    expect(config.fileKey).toBe("cliFile");
    expect(config.accessToken).toBe("cliToken");
  });

  it("parses --pages as comma-separated list", () => {
    const config = parseCliArgs([
      "-f",
      "f",
      "-t",
      "t",
      "--pages",
      "Components, Primitives, Icons",
    ]);
    expect(config.pages).toEqual(["Components", "Primitives", "Icons"]);
  });

  it("defaults pages to empty array", () => {
    const config = parseCliArgs(["-f", "f", "-t", "t"]);
    expect(config.pages).toEqual([]);
  });

  it("defaults format to json", () => {
    const config = parseCliArgs(["-f", "f", "-t", "t"]);
    expect(config.format).toBe("json");
  });

  it("parses --format text", () => {
    const config = parseCliArgs(["-f", "f", "-t", "t", "--format", "text"]);
    expect(config.format).toBe("text");
  });

  it("returns help flag", () => {
    const config = parseCliArgs(["--help"]);
    expect(config.help).toBe(true);
  });

  it("throws if file key is missing", () => {
    expect(() => parseCliArgs(["-t", "tok"], {})).toThrow(
      "File key is required",
    );
  });

  it("throws if access token is missing", () => {
    expect(() => parseCliArgs(["-f", "file"], {})).toThrow(
      "Access token is required",
    );
  });

  describe("branch key", () => {
    it("parses --branch flag", () => {
      const config = parseCliArgs([
        "-f",
        "f",
        "-t",
        "t",
        "--branch",
        "branch123",
      ]);
      expect(config.branchKey).toBe("branch123");
    });

    it("parses short -b flag", () => {
      const config = parseCliArgs(["-f", "f", "-t", "t", "-b", "branch456"]);
      expect(config.branchKey).toBe("branch456");
    });

    it("falls back to FIGMA_BRANCH_KEY environment variable", () => {
      const env = {
        FIGMA_FILE_KEY: "f",
        FIGMA_ACCESS_TOKEN: "t",
        FIGMA_BRANCH_KEY: "envBranch",
      };
      const config = parseCliArgs([], env);
      expect(config.branchKey).toBe("envBranch");
    });

    it("CLI --branch flag overrides FIGMA_BRANCH_KEY env var", () => {
      const env = {
        FIGMA_FILE_KEY: "f",
        FIGMA_ACCESS_TOKEN: "t",
        FIGMA_BRANCH_KEY: "envBranch",
      };
      const config = parseCliArgs(["-b", "cliBranch"], env);
      expect(config.branchKey).toBe("cliBranch");
    });

    it("does not include branchKey when not provided", () => {
      const config = parseCliArgs(["-f", "f", "-t", "t"], {});
      expect(config).not.toHaveProperty("branchKey");
    });

    it("does not include branchKey when env var is empty string", () => {
      const env = {
        FIGMA_FILE_KEY: "f",
        FIGMA_ACCESS_TOKEN: "t",
        FIGMA_BRANCH_KEY: "",
      };
      const config = parseCliArgs([], env);
      expect(config).not.toHaveProperty("branchKey");
    });
  });

  describe("excludePages", () => {
    it("parses --exclude-pages as comma-separated list", () => {
      const config = parseCliArgs([
        "-f", "f", "-t", "t",
        "--exclude-pages", ".explorations, .archive",
      ]);
      expect(config.excludePages).toEqual([".explorations", ".archive"]);
    });

    it("parses short -x flag", () => {
      const config = parseCliArgs(["-f", "f", "-t", "t", "-x", ".labs"]);
      expect(config.excludePages).toEqual([".labs"]);
    });

    it("defaults excludePages to empty array", () => {
      const config = parseCliArgs(["-f", "f", "-t", "t"]);
      expect(config.excludePages).toEqual([]);
    });
  });

  describe("scope", () => {
    it("defaults scope to all", () => {
      const config = parseCliArgs(["-f", "f", "-t", "t"]);
      expect(config.scope).toBe("all");
    });

    it("parses --scope components", () => {
      const config = parseCliArgs([
        "-f",
        "f",
        "-t",
        "t",
        "--scope",
        "components",
      ]);
      expect(config.scope).toBe("components");
    });

    it("parses short -s flag", () => {
      const config = parseCliArgs(["-f", "f", "-t", "t", "-s", "components"]);
      expect(config.scope).toBe("components");
    });

    it("defaults unknown scope values to all", () => {
      const config = parseCliArgs([
        "-f",
        "f",
        "-t",
        "t",
        "--scope",
        "whatever",
      ]);
      expect(config.scope).toBe("all");
    });
  });
});

describe("getEffectiveFileKey", () => {
  it("returns branchKey when present", () => {
    const config = {
      fileKey: "main123",
      accessToken: "t",
      branchKey: "branch456",
    };
    expect(getEffectiveFileKey(config)).toBe("branch456");
  });

  it("returns fileKey when branchKey is absent", () => {
    const config = { fileKey: "main123", accessToken: "t" };
    expect(getEffectiveFileKey(config)).toBe("main123");
  });

  it("returns fileKey when branchKey is undefined", () => {
    const config = {
      fileKey: "main123",
      accessToken: "t",
      branchKey: undefined,
    };
    expect(getEffectiveFileKey(config)).toBe("main123");
  });

  it("returns fileKey when branchKey is empty string", () => {
    const config = { fileKey: "main123", accessToken: "t", branchKey: "" };
    expect(getEffectiveFileKey(config)).toBe("main123");
  });
});

describe("formatReport", () => {
  const report = {
    title: "Test Report",
    summary: { total: 5, issues: 2 },
    issues: [
      { component: "Button", issue: "Missing description" },
      { component: "Card", issue: "Missing description" },
    ],
  };

  it("formats as JSON when format is json", () => {
    const output = formatReport(report, "json");
    const parsed = JSON.parse(output);
    expect(parsed.title).toBe("Test Report");
    expect(parsed.issues).toHaveLength(2);
  });

  it("formats as readable text when format is text", () => {
    const output = formatReport(report, "text");
    expect(output).toContain("Test Report");
    expect(output).toContain("total: 5");
    expect(output).toContain("Issues (2)");
    expect(output).toContain("Button");
  });

  it("shows success message when no issues", () => {
    const clean = { title: "Clean", summary: {}, issues: [] };
    const output = formatReport(clean, "text");
    expect(output).toContain("No issues found");
  });
});
