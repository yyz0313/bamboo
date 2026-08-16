# ZCode/Codex Features Missing in dsh: Plugin Design

## Summary

This document identifies features from Codex/ZCode that are missing or differently implemented in dsh (DeepSeek Harness), and provides designs for implementing them as dsh plugins.

## Feature Gap Analysis

| Feature Category | dsh Has | Codex/ZCode Has | Missing in dsh | Plugin Design |
|-----------------|---------|-----------------|----------------|---------------|
| **MCP Integration** | No native MCP | `mcp__node_repl__*` server, browser-control | ✗ | `dsh-mcp-bridge` plugin |
| **Document Generation** | Basic tools only | Full DOCX/PDF/PPTX with templates | ✗ | `dsh-document-skills` plugin |
| **Skill Development** | Manual skill creation | AI-assisted skill authoring | ✗ | `dsh-skill-creator` plugin |
| **Browser Automation** | Via shell tools | Playwright DOM → locator → act workflow | ✗ | `dsh-browser-automation` plugin |
| **Diagnostics** | Manual debugging | Systematic troubleshooting skills | ✗ | `dsh-diagnostics` plugin |
| **Marketplace** | None | Plugin installation system | ✗ | `dsh-marketplace-client` plugin |

## Plugin 1: dsh-mcp-bridge

### Purpose
Bridge dsh to Model Context Protocol (MCP) servers, enabling use of existing MCP tools (node_repl, browser-use, etc.) in dsh agent sessions.

### Implementation Location
`plugins/mcp-bridge/`

### Key Components

1. **mcp-client.py** - Async MCP client that implements dsh tool interface
2. **server-registry.yml** - Registers MCP servers as dsh tools
3. **tool-adapter.py** - Converts between dsh tool calls and MCP protocol

### API Design

```yaml
# MCP Bridge Plugin Configuration
id: tool-mcp-bridge
name: '@deepseek-ai/dsh-tool-mcp-bridge'
config:
  servers:
    - name: node-repl
      command: mcp__node_repl__js
      description: "Execute JavaScript in Node.js environment"
    - name: browser
      command: mcp__browser_use__browser
      description: "Browser automation with Playwright"
  
  # Fallback behavior
  fallbackToShell: true
  timeoutMs: 30000
```

### Subagent Configuration
Subagents can specify which MCP servers to use:

```json
{
  "subagentId": "browser-analyst",
  "mcpServer": "browser",
  "environment": {
    "BAMBOO_MCP_SERVER": "browser"
  }
}
```

### Tool Signatures

```python
# MCP Tool - generic tool caller
def mcp_call(
    mcp_server: str,           # which MCP server
    tool_name: str,            # tool to call
    arguments: dict,           # tool arguments
    timeout: int = 30000       # call timeout
) -> dict:
    """Call an MCP server tool."""
    ...
```

## Plugin 2: dsh-document-skills

### Purpose
Provide comprehensive document creation, editing, and analysis capabilities for DOCX, PDF, and PPTX formats.

### Implementation Location
`plugins/document-skills/`

### Key Components

1. **docx_generator.py** - DOCX creation with templates
2. **pdf_analyzer.py** - PDF reading and extraction
3. **pptx_builder.py** - PowerPoint generation
4. **formatters/** - Document formatting rules

### API Design

```yaml
# Document Skills Configuration
id: tool-document
name: '@deepseek-ai/dsh-tool-document'
config:
  formats:
    - docx
    - pdf
    - pptx
  
  # Cover recipe configuration
  coverRecipes:
    - name: R1_report
      type: report
      palette: morandi
      
    - name: R2_academic
      type: academic
      palette: professional
  
  # Font profiles
  fonts:
    cjk: "SimSun"
    latin: "Calibri"
```

### Tool Signatures

```python
# DOCX Creation Tool
def create_document(
    format: str,           # docx, pdf, pptx
    title: str,            # document title
    content: str,          # main content
    cover_recipe: str,     # R1-R7 cover template
    theme: str,            # color palette
    chapters: list = None, # optional chapter structure
    metadata: dict = None  # author, date, etc.
) -> str:
    """Create a new document with proper formatting."""
    ...

# DOCX Edit Tool  
def edit_document(
    path: str,             # file path
    operation: str,        # read, update, reformat
    changes: dict          # specific changes to make
) -> dict:
    """Edit an existing document."""
    ...

# PDF Analysis Tool
def analyze_pdf(
    path: str,
    extract_text: bool = True,
    extract_images: bool = False
) -> dict:
    """Analyze PDF content and structure."""
    ...

# Post-Check Tool
def validate_document(
    path: str,
    rules: list = None    # specific rules to check
) -> dict:
    """Run post-generation validation checks."""
    ...
```

### Cover Recipes R1-R7 (from ZCode)

```python
COVER_RECIPES = {
    "R1": {  # Report
        "layout": "title_table",
        "spacing": {"title": 40pt, "lines": 1.3},
        "font": {"title": 40pt, "body": "SimSun 12pt"}
    },
    "R2": {  # Academic paper
        "layout": "academic_header",
        "spacing": {"title": 36pt, "lines": 1.5},
        "font": {"title": 24pt, "body": "Times New Roman 12pt"}
    },
    # ... R3-R7
}
```

## Plugin 3: dsh-skill-creator

### Purpose
AI-assisted skill authoring and iteration for dsh plugins.

### Implementation Location
`plugins/skill-creator/`

### Key Components

1. **skill-author.py** - AI-assisted skill drafting
2. **skill-evaluator.py** - Test prompt evaluation
3. **skill-improver.py** - Iterative refinement suggestions

### API Design

```yaml
id: tool-skill-creator
name: '@deepseek-ai/dsh-tool-skill-creator'
config:
  templateDir: ".zcode/skills"
  referenceDirs:
    - "references/skill-templates"
    - "references/design-system"
```

### Tool Signatures

```python
def create_skill(
    name: str,              # skill identifier
    purpose: str,           # what the skill does
    trigger_phrases: list,  # when it should activate
    test_prompts: list,     # scenarios to test
    output_format: str      # expected output format
) -> dict:
    """Create a new skill specification."""
    ...

def evaluate_skill(
    skill_path: str,        # path to SKILL.md
    test_prompts: list,     # prompts to test
    iterations: int = 3     # number of test rounds
) -> dict:
    """Evaluate skill performance and suggest improvements."""
    ...

def iterate_skill(
    skill_path: str,
    issues: list,           # issues found
    improvements: list      # suggested improvements
) -> str:
    """Apply improvements to an existing skill."""
    ...
```

## Plugin 4: dsh-browser-automation

### Purpose
High-level browser automation using Playwright with DOM snapshotning and semantic locator workflows.

### Implementation Location
`plugins/browser-automation/`

### Key Components

1. **browser_control.py** - Browser session management
2. **locator_engine.py** - Semantic element location
3. **dom_snapshot.py** - DOM state capture

### API Design

```yaml
id: tool-browser
name: '@deepseek-ai/dsh-tool-browser'
config:
  browsers:
    - chromium
    - firefox
    - webkit
  headless: true
  defaultViewport: "1280x720"
```

### Tool Signatures

```python
def browser_navigate(
    url: str,
    wait_until: str = "networkidle"  # load, domcontentloaded, networkidle, commit
) -> dict:
    """Navigate to a URL in browser."""
    ...

def browser_snapshot() -> dict:
    """Take a semantic snapshot of current page."""
    ...

def browser_click(
    selector: str,    # CSS selector or semantic description
    position: dict = None  # {x, y} relative to element
) -> dict:
    """Click an element on the page."""
    ...

def browser_fill(
    selector: str,
    value: str
) -> dict:
    """Fill input field with value."""
    ...

def browser_extract(
    selector: str = None,
    attribute: str = None
) -> dict:
    """Extract content from page."""
    ...

def browser_screenshot(
    selector: str = None,
    full_page: bool = True
) -> str:
    """Take a screenshot of page or element."""
    ...

def browser_close() -> dict:
    """Close browser."""
    ...
```

## Plugin 5: dsh-diagnostics

### Purpose
Systematic troubleshooting and diagnosis tools.

### Implementation Location
`plugins/diagnostics/`

### Tool Signatures

```python
def diagnose_tool(
    tool_name: str,       # which tool to diagnose
    last_error: str = None  # last error message
) -> dict:
    """Diagnose issues with a specific tool."""
    ...

def diagnose_network() -> dict:
    """Check network connectivity and configuration."""
    ...

def diagnose_environment() -> dict:
    """Check environment setup and configuration."""
    ...
```

## Integration with Subagents

All plugins support subagent configuration:

```json
{
  "preset": "document-expert",
  "subagents": [
    {
      "id": "web-analyst",
      "tools": ["tool-browser", "tool-document"],
      "model": "deepseek-v4",
      "temperature": 0.3,
      "maxTokens": 32000
    },
    {
      "id": "diagnostician",
      "tools": ["tool-diagnostics"],
      "model": "deepseek-v4",
      "temperature": 0.1
    }
  ]
}
```

## Environment Variables

Plugins use standard Bamboo environment variables:
- `BAMBOO_SUBAGENT_<ID>_CONFIG` - Subagent configuration
- `BAMBOO_PRESET` - Default preset selection
- `DEEPSEEK_API_KEY` - API key forwarded to dsh

## Implementation Priority

1. **dsh-mcp-bridge** - Highest priority, enables all existing ZCode MCP tools
2. **dsh-document-skills** - High priority for document generation workflows
3. **dsh-browser-automation** - High priority for web tasks
4. **dsh-skill-creator** - Medium priority for plugin development
5. **dsh-diagnostics** - Medium priority for troubleshooting

## Next Steps

1. Implement `dsh-mcp-bridge` to get MCP server support
2. Implement `dsh-document-skills` for DOCX/PDF/PPTX features
3. Update bridge/main.py to support subagent tool specifications
4. Add plugin discovery and loading mechanisms to dsh-core