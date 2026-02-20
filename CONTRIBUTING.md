# Contributing to subnet

Thank you for your interest in contributing to subnet! This is an open standard and reference implementation designed to be forked, modified, and extended.

## Ways to Contribute

### 1. Join this subnet hub
Follow the instructions in the [README](README.md#joining-this-subnet) to add yourself as a node.

### 2. Report issues or suggest improvements
Open an issue on GitHub if you find bugs, have questions about the spec, or want to propose enhancements.

### 3. Submit code improvements
PRs are welcome for:
- Bug fixes
- Documentation improvements
- Builder script enhancements
- Widget features
- Template/style improvements

### 4. Fork and create your own implementation
The subnet spec is intentionally minimal. You can:
- Build your own hub in any language
- Create alternative widgets
- Design different templates
- Add features specific to your community

Any implementation that serves `subnet.json`, verifies `<link rel="subnet">` tags, and provides an Atom feed can interoperate with this one.

## Development

### Prerequisites
- Node.js 18 or later
- No dependencies to install

### Commands
```bash
npm run build   # Generate _site/ from subnet.json
npm run verify  # Check all nodes have link tags
```

### Code Style
- Zero dependencies philosophy — keep it that way
- Prefer vanilla JS, no frameworks
- Use Node.js built-ins (`node:fs`, `node:path`, etc.)
- Keep the builder functional and stateless
- Match existing code style (2 spaces, semicolons, double quotes)

### Pull Request Process

1. Test your changes locally with `npm run build` and `npm run verify`
2. Update documentation if you change behavior
3. Keep commits focused and descriptive
4. The CI workflow will verify that all nodes still have valid link tags

## License

By contributing code, you agree to license your contribution under the [MPL-2.0](LICENSE) license.

The subnet specification itself is licensed under [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/).
