import { Octokit } from "octokit";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";

config();

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

type RepoConfig = {
  owner: string;
  repo: string;
};

type ContentUpdate = {
  path: string;
  content: string;
  sha?: string;
};

const getDefaultContent = (path: string): string => {
  if (path === "docs/core/principles.md") {
    return `# Core Principles

## Vision Statement
Bridging today's maker revolution to tomorrow's abundance through the thoughtful fusion of AI and 3D printing technologies.

## Core Principles

1. Transparent AI Integration
2. Progressive Technology Mapping
3. Community-Driven Innovation
4. Educational Empowerment
5. Ethical Innovation Focus

This document needs to be enhanced with specific details and examples.`;
  }
  return "";
};

const getContent = async (
  config: RepoConfig,
  path: string
): Promise<string> => {
  try {
    const response = await octokit.rest.repos.getContent({
      ...config,
      path,
    });

    // GitHub returns content as base64
    if (
      "content" in response.data &&
      typeof response.data.content === "string"
    ) {
      const content = Buffer.from(response.data.content, "base64").toString();
      return content.trim() ? content : getDefaultContent(path);
    }

    throw new Error("Content not found or is a directory");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 404
    ) {
      console.log(`File ${path} not found. Creating with default content.`);
      return getDefaultContent(path);
    }
    console.error("Error fetching content:", error);
    throw error;
  }
};

const updateContent = async (
  config: RepoConfig,
  update: ContentUpdate
): Promise<void> => {
  try {
    let sha: string | undefined = update.sha;

    // Try to get the current file's SHA if not provided
    if (!sha) {
      try {
        const currentFile = await octokit.rest.repos.getContent({
          ...config,
          path: update.path,
        });

        if ("sha" in currentFile.data) {
          sha = currentFile.data.sha;
        }
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          error.status !== 404
        ) {
          throw error;
        }
        // File doesn't exist, which is fine - we'll create it
      }
    }

    await octokit.rest.repos.createOrUpdateFileContents({
      ...config,
      path: update.path,
      message: sha
        ? `Update ${update.path} via AI agent`
        : `Create ${update.path} via AI agent`,
      content: Buffer.from(update.content).toString("base64"),
      sha,
    });
  } catch (error) {
    console.error("Error updating content:", error);
    throw error;
  }
};

const processWithAI = async (
  content: string,
  instructions: string
): Promise<string> => {
  try {
    const message = await anthropic.beta.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 4000,
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content: `
          Instructions: ${instructions}
          
          Content to process:
          ${content}
        `,
        },
      ],
    });

    // Calculate costs (approximate based on public pricing)
    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;
    const totalTokens = inputTokens + outputTokens;

    // Claude 3 Sonnet pricing (as of March 2024)
    const inputCost = (inputTokens / 1000) * 0.003; // $0.003 per 1K input tokens
    const outputCost = (outputTokens / 1000) * 0.015; // $0.015 per 1K output tokens
    const totalCost = inputCost + outputCost;

    console.log("\nAI Processing Stats:");
    console.log("------------------");
    console.log(`Input Tokens: ${inputTokens.toLocaleString()}`);
    console.log(`Output Tokens: ${outputTokens.toLocaleString()}`);
    console.log(`Total Tokens: ${totalTokens.toLocaleString()}`);
    console.log(`Estimated Cost: $${totalCost.toFixed(4)}`);
    console.log("------------------\n");

    return message.content[0].type === "text" ? message.content[0].text : "";
  } catch (error) {
    console.error("Error processing with Claude:", error);
    throw error;
  }
};

const processingPipeline = async (
  config: RepoConfig,
  path: string,
  instructions: string
) => {
  const content = await getContent(config, path);
  const processedContent = await processWithAI(content, instructions);
  await updateContent(config, { path, content: processedContent });
};

const validateEnv = () => {
  const required = [
    "GITHUB_TOKEN",
    "ANTHROPIC_API_KEY",
    "GITHUB_OWNER",
    "GITHUB_REPO",
  ];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
};

// Example usage
const main = async () => {
  const config: RepoConfig = {
    owner: process.env.GITHUB_OWNER!,
    repo: process.env.GITHUB_REPO!,
  };

  try {
    await processingPipeline(
      config,
      "docs/core/principles.md",
      "Review and enhance this document while maintaining our core principles. Add specific examples where appropriate."
    );
    console.log("Successfully processed and updated content");
  } catch (error) {
    console.error("Error in main process:", error);
  }
};

validateEnv();
main();
