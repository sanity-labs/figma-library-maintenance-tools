This project intends to contain a collection of single-purpose tools that utilize Figma's REST API to allow agents to comb through a library in order to make improvements. The primary use of these tools will be to provide CLI access for agents to be given a list of issues that need to be addressed. These tools should also work for humans, but the experience should be optimized for agentic use. 

Read through `figma-automation-requirements.md` and ignore the recommendations for the tools to be built as plugins. Take the requirements and apply them through the lens of a CLI using Figma's REST API. Each automation should be an invidivdual tool. 

# Instructions
* All tools should be built using Node.js and written in Javascript. Avoid TypeScript usage entirely
* All tools should be usable through the CLI or imported into a Node.js application
* All tools should have full test coverage. Use vitest for unit testing
* Functions should be written to be small, atomic, easily testable and single-purpose
* All functions should have full JSDoc documentation
* A README should be created that covers installation and usage of each tool
