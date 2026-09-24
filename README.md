# 🚀 Models.dev MCP Server

A powerful [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that exposes the entire [models.dev](https://models.dev) database — the comprehensive open-source database of AI model specifications, pricing, and capabilities.

**34 tools** across 7 categories give AI agents full access to search, compare, analyze, and generate code for 400+ AI models from 200+ providers.

## ⚡ Quick Start

### Install & Build

```bash
npm install
npm run build
```

### Run (stdio — for Claude Desktop, Cursor, etc.)

```bash
node dist/index.js
```

### Run (SSE — for remote access)

```bash
# Default port (3000)
node dist/index.js sse

# Custom port via flag
node dist/index.js sse --port 8080
# or short flag: node dist/index.js sse -p 8080
# or positional: node dist/index.js sse 8080

# Custom port & host via environment variables
PORT=8080 HOST=0.0.0.0 node dist/index.js sse
```

### 🐧 Run as Linux Service (Systemd)

#### Auto Install (Recommended)

Run the included install script to automatically set up and enable a systemd user service:

```bash
npm run service:install
# or custom port: PORT=8080 npm run service:install
```

#### Service Commands

```bash
# Check status
systemctl --user status models-dev-mcp

# View logs in real-time
journalctl --user -u models-dev-mcp -f

# Restart / Stop service
systemctl --user restart models-dev-mcp
systemctl --user stop models-dev-mcp
```

## 🔌 Configuration

### Option 1: Stdio Transport (Local Process)

For local execution directly by the AI client (Claude Desktop, Cursor, Cline, etc.):

```json
{
  "mcpServers": {
    "models-dev": {
      "command": "node",
      "args": ["/absolute/path/to/models.dev-mcp/dist/index.js"]
    }
  }
}
```

---

### Option 2: SSE Transport (Remote / Linux Service)

When running the MCP server in SSE mode (e.g. as a systemd service on port `8001` or custom port):

#### Clients supporting SSE directly (Cursor, Cline, Open WebUI, etc.)

Add to your client's MCP configuration file (e.g. `.cursor/mcp.json` or `cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "models-dev": {
      "url": "http://localhost:8001/sse"
    }
  }
}
```

> 💡 *Replace `localhost:8001` with your server's IP/hostname and port if running on a remote server (e.g., `http://192.168.1.100:8001/sse`).*

#### Claude Desktop or Clients requiring Stdio Bridge to SSE

For clients that only support stdio natively, connect to your SSE server using `mcp-remote` bridge:

```json
{
  "mcpServers": {
    "models-dev": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:8001/sse"]
    }
  }
}
```

## 🛠️ Tools (34 total)

### 🔍 Model Discovery (7)
| Tool | Description |
|---|---|
| `search_models` | Search by name, lab, or keyword with fuzzy matching |
| `list_models` | List all models with pagination & sorting |
| `get_model` | Get full details of a model by ID |
| `list_model_families` | List all model families with counts |
| `get_models_by_family` | Get all models in a family |
| `get_latest_models` | Models released in the last N days |
| `get_trending_models` | Most popular models by provider count |

### 💰 Pricing Analysis (5)
| Tool | Description |
|---|---|
| `compare_pricing` | Compare pricing across providers |
| `find_cheapest_model` | Find cheapest model meeting requirements |
| `calculate_cost` | Calculate cost for token usage |
| `get_free_models` | List free models |
| `price_comparison_table` | Multi-model price comparison table |

### 🏢 Provider Intelligence (5)
| Tool | Description |
|---|---|
| `list_providers` | List all providers with SDK details |
| `get_provider` | Get provider details + models |
| `get_provider_models` | All models from a provider |
| `find_providers_for_model` | Find providers hosting a model |
| `get_provider_sdk_info` | SDK integration details |

### 🔬 Capability Filtering (6)
| Tool | Description |
|---|---|
| `filter_models` | Multi-criteria filtering |
| `compare_models` | Side-by-side comparison (2-5 models) |
| `find_best_model_for` | Best model for a use case |
| `get_multimodal_models` | Models by modality support |
| `get_reasoning_models` | Models with reasoning capabilities |
| `get_open_weight_models` | Open-source models with licenses |

### 🔗 Integration Helper (4)
| Tool | Description |
|---|---|
| `generate_sdk_code` | Generate AI SDK code snippets |
| `get_env_setup` | Environment variable templates |
| `get_model_id_for_provider` | Correct model ID per provider |
| `validate_model_config` | Validate model configuration |

### 📊 Analytics (4)
| Tool | Description |
|---|---|
| `get_market_overview` | Market stats & overview |
| `get_lab_summary` | Per-lab model summary |
| `get_context_leaders` | Largest context windows |
| `get_price_distribution` | Price distribution analysis |

### 🧰 Utility (3)
| Tool | Description |
|---|---|
| `get_model_schema` | Data schema reference |
| `get_changelog` | Recent additions & updates |
| `get_model_benchmarks` | Benchmark scores |

## 📊 Data Source

All data comes from [models.dev](https://models.dev) APIs:
- `https://models.dev/api.json` — Full provider + model data
- `https://models.dev/models.json` — Provider-agnostic model metadata

Data is cached in-memory for 5 minutes to avoid excessive API calls.

## 🏗️ Development

```bash
# Dev mode with hot reload
npm run dev

# Type check
npm run typecheck

# Build
npm run build
```

## License

MIT
