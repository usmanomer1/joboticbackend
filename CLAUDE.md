# Jobotic Backend - AI Assistant Instructions

This is a focused job search and matching backend service. It provides job search functionality through JSearch API integration and AI-powered job matching using Google Gemini.

# Project Memory – Development Guidelines

## Forbidden Actions
- **Never** run any dev server (e.g. `npm run dev`, `hugo server`, `rails server`, etc.)
- Stop before any action that may start a server process

## Git Workflow
- After every task or change, always commit the changes
- Use meaningful conventional commit messages (e.g. `feat:`, `fix:`, `chore:`)
- Do **not** include any AI attribution or "co‑authored-by Claude" tags in commit messages  [oai_citation:2‡Reddit](https://www.reddit.com/r/ClaudeAI/comments/1kzxzkc/whats_up_with_claude_crediting_itself_in_commit/?utm_source=chatgpt.com)

## Core Functionality

This service focuses exclusively on:
- Job search across multiple job boards
- AI-powered job-to-resume matching
- Salary estimation
- Job details retrieval
- LinkedIn job automation using Stagehand and Browserbase

**Note**: Resume generation and editing functionality has been moved to a separate Python service.

## Project Identifiers
- Supabase Project ID: wqyquvgduwjkyadkumkl

## Stagehand Project Rules

This is a project that uses Stagehand, which amplifies Playwright with `act`, `extract`, and `observe` added to the Page class.

`Stagehand` is a class that provides config, a `StagehandPage` object via `stagehand.page`, and a `StagehandContext` object via `stagehand.context`.

`Page` is a class that extends the Playwright `Page` class and adds `act`, `extract`, and `observe` methods.
`Context` is a class that extends the Playwright `BrowserContext` class.

Use the following rules to write code for this project.

### Observe

To plan an instruction like "click the sign in button", use Stagehand `observe` to get the action to execute.

```typescript
const results = await page.observe("Click the sign in button");
```

You can also pass in the following params:

```typescript
await page.observe({
  instruction: the instruction to execute,
  onlyVisible: false, // DEFAULT: Returns better results and less tokens, but uses Chrome a11y tree so may not always target directly visible elements
  returnAction: true, // DEFAULT: return the action to execute
});
```

The result of `observe` is an array of `ObserveResult` objects that can directly be used as params for `act` like this:
```typescript
const results = await page.observe({
  instruction: the instruction to execute,
  onlyVisible: false, // Returns better results and less tokens, but uses Chrome a11y tree so may not always target directly visible elements
  returnAction: true, // return the action to execute
});
await page.act(results[0]);
```

### Extract

When writing code that needs to extract data from the page, use Stagehand `extract`. Explicitly pass the following params by default:

```typescript
const { someValue } = await page.extract({
  instruction: the instruction to execute,
  schema: z.object({
    someValue: z.string(),
  }), // The schema to extract
  useTextExtract: true, // Set true for better results on larger extractions (sentences, paragraphs, etc), or set false for small extractions (name, birthday, etc)
});
```

### Initialize

```typescript
import { Stagehand } from "@browserbasehq/stagehand";
import StagehandConfig from "./stagehand.config";

const stagehand = new Stagehand(StagehandConfig);
await stagehand.init();

const page = stagehand.page; // Playwright Page with act, extract, and observe methods
const context = stagehand.context; // Playwright BrowserContext
```

### Act

You can cache the results of `observe` and use them as params for `act` like this:

```typescript
const instruction = "Click the sign in button";
const cachedAction = await getCache(instruction);

if (cachedAction) {
  await page.act(cachedAction);
} else {
  try {
    const results = await page.observe(instruction);
    await setCache(instruction, results);
    await page.act(results[0]);
  } catch (error) {
    await page.act(instruction); // If the action is not cached, execute the instruction directly
  }
}
```

Be sure to cache the results of `observe` and use them as params for `act` to avoid unexpected DOM changes. Using `act` without caching will result in more unpredictable behavior.

Act `action` should be as atomic and specific as possible, i.e. "Click the sign in button" or "Type 'hello' into the search input".
AVOID actions that are more than one step, i.e. "Order me pizza" or "Send an email to Paul asking him to call me".

### Extract (Additional Examples)

If you are writing code that needs to extract data from the page, use Stagehand `extract`.

```typescript
const signInButtonText = await page.extract("extract the sign in button text");
```

You can also pass in params like an output schema in Zod, and a flag to use text extraction:

```typescript
const data = await page.extract({
  instruction: "extract the sign in button text",
  schema: z.object({
    text: z.string(),
  }),
  useTextExtract: true, // Set true for larger-scale extractions (multiple paragraphs), or set false for small extractions (name, birthday, etc)
});
```

`schema` is a Zod schema that describes the data you want to extract. To extract an array, make sure to pass in a single object that contains the array, as follows:

```typescript
const data = await page.extract({
  instruction: "extract the text inside all buttons",
  schema: z.object({
    text: z.array(z.string()),
  }),
  useTextExtract: true, // Set true for larger-scale extractions (multiple paragraphs), or set false for small extractions (name, birthday, etc)
});
```

[... rest of the existing content remains unchanged ...]