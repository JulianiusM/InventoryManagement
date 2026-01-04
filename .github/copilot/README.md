# Modular Copilot Instructions

This directory contains modular GitHub Copilot instruction files. The main instruction file ([copilot-instructions.md](../copilot-instructions.md)) references these modules to keep the documentation organized and maintainable.

## Files

- **[project-overview.md](project-overview.md)** - Project description, technology stack, and key dependencies
- **[code-style.md](code-style.md)** - TypeScript conventions and file organization patterns
- **[database-guidelines.md](database-guidelines.md)** - Entity definitions, migrations, and database testing
- **[testing-quick-reference.md](testing-quick-reference.md)** - Summary of testing patterns and organization
- **[build-and-run.md](build-and-run.md)** - Development, build, and CI/CD information
- **[common-tasks.md](common-tasks.md)** - Common workflows, security considerations, and helpful notes

## Purpose

Breaking down the instructions into modular files provides several benefits:

1. **Easier Maintenance**: Update specific sections without affecting others
2. **Better Organization**: Related guidelines grouped together
3. **Reduced Duplication**: Reference comprehensive docs (TESTING.md, AGENTS.md) instead of duplicating
4. **Focused Guidance**: Each file covers a specific aspect of development
5. **Scalability**: Easy to add new instruction modules as the project grows

## Usage

These files are referenced by the main [copilot-instructions.md](../copilot-instructions.md) file. Copilot will read the main file and can navigate to these modules for detailed information.

## Related Documentation

For more detailed information, see:
- [TESTING.md](../../TESTING.md) - Comprehensive testing guide
- [AGENTS.md](../../AGENTS.md) - General AI agent guidance
- [README.md](../../README.md) - Project overview and setup
