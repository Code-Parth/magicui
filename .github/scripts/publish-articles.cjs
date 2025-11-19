#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

/**
 * Sanitize markdown content to fix common formatting issues
 * @param {string} content - The markdown content to sanitize
 * @returns {string} - Sanitized content
 */
function sanitizeMarkdown(content) {
  if (!content || typeof content !== "string") return "";

  let sanitized = content;

  // Step 1: Fix mismatched code block backticks (4+ backticks to 3)
  // Handle both opening (with language) and closing blocks
  sanitized = sanitized.replace(/````+/g, "```");

  // Step 2: Ensure newline before code blocks (but not at start of content)
  sanitized = sanitized.replace(/([^\n])```/g, "$1\n```");

  // Step 3: Ensure newline after code block closing (but preserve content after)
  sanitized = sanitized.replace(/```([^`\na-z])/g, "```\n$1");

  // Step 4: Count code blocks for validation
  // Match opening: ``` followed by optional language, then newline
  const openingBlocks = (sanitized.match(/^```[a-z]*\n/gim) || []).length;
  // Match closing: newline, then ```, then newline or end of string
  const closingBlocks = (sanitized.match(/\n```(\n|$)/g) || []).length;

  // Log warning if blocks don't match
  if (openingBlocks !== closingBlocks) {
    console.warn(
      `⚠️  Warning: Mismatched code blocks detected (${openingBlocks} opening, ${closingBlocks} closing). Manual review may be needed.`,
    );
  }

  // Step 5: Remove trailing whitespace from lines
  sanitized = sanitized.replace(/[ \t]+$/gm, "");

  // Step 6: Normalize multiple consecutive blank lines to max 2
  sanitized = sanitized.replace(/\n{4,}/g, "\n\n\n");

  // Step 7: Ensure file ends with single newline
  sanitized = sanitized.replace(/\n*$/, "\n");

  return sanitized;
}

/**
 * Validate frontmatter object
 * @param {object} fmObj - The frontmatter object to validate
 * @returns {boolean} - True if valid
 */
function validateFrontmatter(fmObj) {
  const requiredFields = ["title", "description"];
  const missingFields = requiredFields.filter((field) => !fmObj[field]);

  if (missingFields.length > 0) {
    console.error(
      `❌ Missing required frontmatter fields: ${missingFields.join(", ")}`,
    );
    return false;
  }

  return true;
}

/**
 * Validate article object structure
 * @param {object} article - The article object to validate
 * @returns {boolean} - True if valid
 */
function validateArticle(article) {
  if (!article || typeof article !== "object") {
    console.error("❌ Invalid article object");
    return false;
  }

  if (!article.slug || typeof article.slug !== "string") {
    console.error("❌ Article missing valid slug");
    return false;
  }

  // Validate slug format (alphanumeric, hyphens only)
  if (!/^[a-z0-9-]+$/.test(article.slug)) {
    console.error(`❌ Invalid slug format: ${article.slug}`);
    return false;
  }

  if (!article.title || typeof article.title !== "string") {
    console.error(`❌ Article "${article.slug}" missing valid title`);
    return false;
  }

  return true;
}

/**
 * Main execution
 */
function main() {
  try {
    // Read and parse payload
    console.log("📄 Reading payload.json...");
    const payloadData = fs.readFileSync("payload.json", "utf8");
    const payload = JSON.parse(payloadData);

    // Extract articles array
    const articles = (payload && payload.data && payload.data.articles) || [];

    if (!Array.isArray(articles)) {
      console.error("❌ Payload does not contain a valid articles array");
      process.exit(1);
    }

    if (articles.length === 0) {
      console.log("ℹ️  No articles to process");
      process.exit(0);
    }

    console.log(`📝 Processing ${articles.length} article(s)...`);

    // Prepare output folder
    const folder = path.join("apps", "www", "content", "blog");
    fs.mkdirSync(folder, { recursive: true });

    let successCount = 0;
    let errorCount = 0;

    // Process each article
    for (const article of articles) {
      try {
        console.log(`\n🔍 Processing article: ${article.slug || "unknown"}`);

        // Validate article structure
        if (!validateArticle(article)) {
          errorCount++;
          continue;
        }

        // Build frontmatter object
        const fmObj = {
          title: article.title || "",
          description: article.meta_description || "",
          image: article.image_url || "",
          author: "Dillion Verma",
          tags: Array.isArray(article.tags) ? article.tags : [],
          publishedOn: article.created_at || new Date().toISOString(),
          featured: true,
        };

        // Validate frontmatter
        if (!validateFrontmatter(fmObj)) {
          errorCount++;
          continue;
        }

        // Generate frontmatter YAML
        const fm =
          "---\n" + yaml.dump(fmObj, { noRefs: true, lineWidth: 80 }) + "---\n";

        // Sanitize markdown content
        const rawBody = String(article.content_markdown || "");
        const sanitizedBody = sanitizeMarkdown(rawBody);

        // Combine frontmatter and body
        const fullContent = fm + sanitizedBody;

        // Write file
        const filename = `${article.slug}.mdx`;
        const filepath = path.join(folder, filename);

        fs.writeFileSync(filepath, fullContent, "utf8");
        console.log(`✅ Successfully wrote: ${filepath}`);
        successCount++;
      } catch (error) {
        console.error(
          `❌ Error processing article "${article.slug || "unknown"}":`,
          error.message,
        );
        errorCount++;
      }
    }

    // Summary
    console.log(`\n${"=".repeat(50)}`);
    console.log(`📊 Summary:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Errors:  ${errorCount}`);
    console.log(`${"=".repeat(50)}\n`);

    // Exit with error code if any articles failed
    if (errorCount > 0) {
      console.error(
        `⚠️  ${errorCount} article(s) failed to process. Check logs above.`,
      );
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Fatal error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run main function
main();
