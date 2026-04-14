# Contributing to LLMScope

Thank you for your interest in contributing to LLMScope! This document provides guidelines for contributing to this project.

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/llmscope.git
   cd llmscope
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Build the project**
   ```bash
   pnpm exec turbo run build --force
   ```

4. **Run tests**
   ```bash
   pnpm test
   pnpm typecheck
   pnpm lint
   ```

## Code Guidelines

- **TypeScript**: Use TypeScript for all code
- **ESLint**: Follow the project's ESLint rules
- **Prettier**: Use Prettier for code formatting
- **Commit messages**: Follow conventional commits

## Pull Request Process

1. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes**
   - Add tests for new functionality
   - Update documentation as needed

3. **Run tests**
   ```bash
   pnpm test
   pnpm typecheck
   pnpm lint
   ```

4. **Commit changes**
   ```bash
   git commit -m "feat: add your feature description"
   ```

5. **Push branch**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a pull request**
   - Provide a clear description of the changes
   - Reference any related issues

## Reporting Issues

- Use the GitHub issue tracker to report bugs or request features
- Include a clear description of the issue
- Provide steps to reproduce the bug
- Include any relevant error messages or logs

## Code of Conduct

Please be respectful and constructive in all communications. We welcome contributions from everyone regardless of background or experience level.
