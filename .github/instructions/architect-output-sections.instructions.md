---
applyTo: '_architect/**/*.md'
---

# Architect Pipeline — Required Output Sections

Every document you produce MUST contain ALL of the following sections in this exact order. Each section must be written in detailed, flowing prose — not bullet lists or code blocks. Use paragraphs, not fragments.

### 1. Introduction
Provide a clear, contextual opening that frames the problem domain. Describe what area of the system is under consideration, why it matters, and what the reader should expect from this document. Set the scene for someone who may not have full context.

### 2. Motivation
Explain the driving forces behind this work. What pain points exist today? What user complaints, technical debt, performance bottlenecks, or business requirements make this work necessary? Ground every motivation in observable evidence from the codebase or stated requirements.

### 3. Purpose
State the precise objectives of the proposed work. What will be true after implementation that is not true today? Define success criteria in measurable terms. Distinguish between must-have outcomes and nice-to-have improvements.

### 4. Analysis
This is the largest and most critical section. Present **at least three distinct approaches** to solving the problem, drawn from industry standards and best practices. For each approach:

- Describe the approach in full detail — how it works, what it changes, what it preserves
- List its strengths relative to the specific codebase (not in the abstract)
- List its weaknesses, risks, and failure modes specific to this codebase
- Assess its compatibility with existing architecture, patterns, and conventions
- Estimate its relative complexity, timeline impact, and maintenance burden
- **Criticize it honestly** — do not present straw-man alternatives just to make one look good

Compare and contrast all approaches against each other using consistent criteria.

### 5. Suggestions
Summarize all viable approaches in a comparative format. Rank them by overall suitability. Identify which approaches can be combined or used in phases. Call out any approaches that should be explicitly rejected and why.

### 6. Recommended Suggestion
Select the single best approach (or hybrid) and justify the selection with specific reasoning tied to the codebase analysis. Explain why each rejected alternative falls short. Address the strongest counterarguments against your recommendation.

### 7. Full Implementation Plan
Elaborate the recommended approach into a comprehensive, phased plan:

- **Phases**: Break the work into logical phases that can each be completed and verified independently. Each phase should deliver incremental value.
- **Steps within phases**: Break each phase into small, manageable, individually-completable tasks. Each step should be specific enough that a developer could start working on it immediately.
- **Dependencies**: Clearly state which steps depend on others and which can be parallelized.
- **Risk points**: Flag steps that carry higher risk and describe mitigation strategies.
- **Ordering rationale**: Explain why the phases and steps are ordered the way they are.

### 8. Implementation Plan Summary
Provide a condensed overview of the implementation plan — a quick-reference version that captures phase names, key milestones, critical dependencies, and estimated relative effort per phase without the full detail.

### 9. Full Test Plan
Describe every category of testing required, in exhaustive detail:

- **Unit tests**: What functions, methods, or components need unit tests? What inputs and edge cases must be covered? What mocking or fixture strategies are appropriate?
- **Integration tests**: What cross-component or cross-service interactions need testing? What data flow paths must be verified?
- **End-to-end tests**: What user workflows must be tested from start to finish? What states and scenarios must be exercised?
- **Regression tests**: What existing functionality could break? How will you verify it remains intact?
- **Edge cases and boundary conditions**: What unusual inputs, states, or timing conditions must be tested?
- **Negative tests**: What should the system reject, and how should rejection be verified?
- **Performance tests**: If applicable, what performance characteristics must be validated?

For each test category, describe the specific test cases in prose — what is being tested, what the expected behavior is, and why that test matters.

### 10. How to Execute and Document the Implementation
Provide a practical execution guide:

- How should the work be structured into commits and pull requests?
- What review process should each phase follow?
- How should progress be tracked and reported?
- What documentation should be updated at each phase?
- What rollback procedures should be in place?
- How should the team communicate status and blockers?

### 11. How to Execute and Document the Tests
Provide a practical test execution guide:

- In what order should tests be written relative to implementation?
- How should test results be captured and reported?
- What constitutes a passing vs. failing test suite?
- How should test coverage be measured and documented?
- What is the process for handling test failures discovered during execution?
- How should the final test report be structured?

### 12. Full Document Summary
Close with a comprehensive summary that recaps:

- The problem, the chosen approach, and why it was selected
- The scope and scale of the implementation
- Key risks and mitigations
- Expected outcomes and success criteria
- Any open questions or decisions that remain
