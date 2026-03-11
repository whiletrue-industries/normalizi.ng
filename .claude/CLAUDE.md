# WORKFLOW

We use GitHub as the source code repository and for managing issues and pull requests.

Normal flow for code changes is:
- Pick an issue from the backlog or create a new one based on the user's description of a problem or feature request.
  (if not sure if an issue already exists, search issues first or ask the user for an issue number)
  - We also use the GitHub project https://github.com/orgs/whiletrue-industries/projects/4/views/2 to manage and prioritize issues.
    You can use this to find issues to work on - note that not all issues are in this repo (for historical reasons).
  - The server side code is in a different repository: 
    https://github.com/whiletrue-industries/chronomaps-server/
    It is a Firebase app using Python on Google Cloud Functions and Firestore as the database.
- Based on the description of the issue, write a detailed implementation plan and add it to the issue as a comment.
  Follow the guidelines in the existing documentation (see below) where applicable.
  Ask the user for confirmation of the plan (or for changes) before starting implementation.
- Create a new branch from `main` named after the issue number and short description, example: '42/fix-login-bug'
  Make sure your local `main` branch is up to date before creating the new branch.
- Make code changes in the branch, committing often with clear commit messages.
  Each commit should represent a logical unit of work, with clear and detailed commit messages.
- When done, ask the user to review the changes and provide feedback or request modifications.
- Once the user approves, push the branch to GitHub.
- When the work is complete, open a pull request against `main`, linking the issue.
  Pull request description should summarize the changes made and reference the issue.
  It should include the text 'fixes #ISSUE_NUMBER' to automatically close the issue when the PR is merged.
- Once the pull request is approved and passes all checks, merge it into `main` using "Squash and merge".

# COMMON TASKS

- Run the development server: `npm start`
- Build the project: `npm run build`
- You will need testing credentials to use when running the app locally. These are passed via query parameters in the URL (name of the parameters is based on the current route, although usually follows the pattern `workspace=` and `api_key=` as well as others).
  The credentials for the testing workspace are:
  - workspace ID: 61358757-cf32-483f-847f-3e4eb3855408
  - API Key (collaborator role): 212aa064-4d02-4edb-8f0b-9f649d026fb2
  - API Key (admin role): e79d200e-b5e3-4043-9c4b-6deddb642fb0
  (in some routes you might need to use both keys, in others only one of them - check the route documentation or ask the user if unsure)

# DOCUMENTATION

Each code change must be accompanied by appropriate documentation updates.

These are the main components of our documentation:
- documentation/ARCHITECTURE.md: High-level architecture: overview, components, data flow, protocols, interfaces.
- documentation/CODING_STANDARDS.md: Coding standards and best practices for the project.
- documentation/DEVELOPMENT_ENV.md: Instructions for setting up the development environment.
- documentation/DEVOPS.md: Deployment, CI and operations procedures.
- documentation/TESTING.md: Testing strategies, frameworks, and guidelines.
- documentation/DESIGN_SYSTEM.md: Design system guidelines and assets.
- documentation/EXTENDING.md: Guidelines for extending the platform with new features or modules.

The api server that we're using also has its own documentation, at https://raw.githubusercontent.com/whiletrue-industries/chronomaps-server/refs/heads/main/docs/API.md

If any of these files does not exist yet, create it and add the relevant information.
REMEMBER: We aim to update documentation and not just dump more text into a file. Structure the information clearly. Read the existing documentation to understand the style and format used. Update the contents of the files as needed to keep them accurate and useful. Remove outdated information if necessary.

# CODE QUALITY AND BEST PRACTICES

You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Use signals for state management
- Use RxJS for handling asynchronous data streams
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.
- Do not write arrow functions in templates (they are not supported).

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection

## CLI
- Use Angular CLI for generating components, services, and other artifacts (e.g. `ng generate component my-component`).