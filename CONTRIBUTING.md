# Contributing to Tamil Nadu Election Analysis

Thank you for your interest in contributing! This project is maintained by [@cnickson](https://github.com/cnickson). All contributions go through pull request review.

## How It Works

1. **Only the maintainer** (cnickson) can review and merge code
2. All changes must go through a Pull Request
3. Direct pushes to `main` are not allowed
4. All PRs require at least one approval before merging

## Getting Started

### 1. Fork the Repository

Click the "Fork" button on GitHub to create your own copy.

### 2. Clone Your Fork

```bash
git clone https://github.com/YOUR_USERNAME/elec.git
cd elec
```

### 3. Set Up Development Environment

```bash
# Copy environment config
cp .env.example .env
# Edit .env with your values (at minimum set POSTGRES_PASSWORD and JWT_SECRET)

# Start services
docker compose up -d

# Frontend will be at http://localhost:5173
# API will be at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### 4. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

### 5. Make Your Changes

- Follow the existing code style
- Test your changes locally with Docker Compose
- Ensure no regressions in existing functionality

### 6. Submit a Pull Request

- Push your branch to your fork
- Open a PR against the `main` branch of this repository
- Describe what your change does and why
- Reference any related issues

## Guidelines

### Code Style

- **Python**: Follow PEP 8. Use type hints.
- **JavaScript/React**: Use functional components, hooks. No TypeScript required but welcome.
- **SQL**: Use parameterized queries only. Never interpolate user input.
- **CSS**: Follow the existing variable-based dark theme structure.

### What We Accept

- Bug fixes
- Performance improvements
- New election data sources (with proper attribution)
- UI/UX improvements
- Accessibility improvements
- Internationalization (Tamil language support welcome)
- Documentation improvements

### What We Don't Accept

- Changes that introduce political bias
- Modifications that present predictions as factual forecasts
- Code that removes data attribution
- Dependencies with known security vulnerabilities
- Features that enable harassment or misinformation

### Security

If you find a security vulnerability, **do not** open a public issue. Email the maintainer directly.

## Data Attribution

This project uses data from the [Trivedi Centre for Political Data (TCPD)](https://tcpd.ashoka.edu.in/) at Ashoka University. Any new data sources must include proper attribution.

## Legal Compliance

All contributions must comply with:
- Indian IT Act, 2000
- Representation of the People Act, 1951 (for election-related content)
- Applicable data protection regulations

## Questions?

Open a GitHub Issue for questions or discussion.
