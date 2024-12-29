import { Octokit } from "octokit";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config();

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

    return message.content[0].type === "text" ? message.content[0].text : "";
  } catch (error) {
    console.error("Error processing with Claude:", error);
    throw error;
  }
};

const validateEnv = () => {
  const required = ["GITHUB_TOKEN", "ANTHROPIC_API_KEY"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
};

// Example processing pipeline
const processingPipeline = async (
  config: RepoConfig,
  path: string,
  instructions: string
) => {
  const content = await getContent(config, path);
  const processedContent = await processWithAI(content, instructions);
  await updateContent(config, { path, content: processedContent });
};

// Example usage
const main = async () => {
  const config: RepoConfig = {
    owner: "noetic97",
    repo: "3d-futures",
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
