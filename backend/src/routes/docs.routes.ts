import { Router } from "express";
import config from "../config.js";

const router = Router();

const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "HoloDreams API",
    version: "1.0.0",
    description:
      "Interactive API documentation for Hololive Dreams talent records, team presets, and roster checklist managers.",
  },
  servers: [
    {
      url: config.isProd ? "" : "http://localhost:5000",
      description: config.isProd ? "Current Server" : "Local Backend Server",
    },
  ],
  paths: {
    "/api/characters": {
      get: {
        summary: "Retrieve talent list",
        description: "Fetch all 54 Hololive talent cards with stats and skill descriptions.",
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Character" } },
              },
            },
          },
        },
      },
    },
    "/api/characters/search": {
      get: {
        summary: "Search characters",
        description: "Full-text search over the precomputed card search index.",
        parameters: [
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Search term (name, title or group)",
          },
        ],
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Character" } },
              },
            },
          },
        },
      },
    },
    "/api/presets": {
      get: {
        summary: "Retrieve team presets",
        description: "Retrieve all 5 team presets for the current device.",
        parameters: [
          {
            name: "x-device-id",
            in: "header",
            required: true,
            schema: { type: "string" },
            description: "Unique Device ID for partitioning data",
          },
        ],
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Preset" } },
              },
            },
          },
        },
      },
      put: {
        summary: "Save team presets",
        description: "Update or insert presets for the current device.",
        parameters: [
          {
            name: "x-device-id",
            in: "header",
            required: true,
            schema: { type: "string" },
            description: "Unique Device ID for partitioning data",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "array", items: { $ref: "#/components/schemas/Preset" } },
            },
          },
        },
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: { type: "object", properties: { success: { type: "boolean" } } },
              },
            },
          },
        },
      },
    },
    "/api/roster": {
      get: {
        summary: "Retrieve owned roster IDs",
        description: "Retrieve the array of character IDs owned by the current device.",
        parameters: [
          {
            name: "x-device-id",
            in: "header",
            required: true,
            schema: { type: "string" },
            description: "Unique Device ID for partitioning data",
          },
        ],
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      put: {
        summary: "Update owned roster IDs",
        description: "Update the array of character IDs owned by the current device.",
        parameters: [
          {
            name: "x-device-id",
            in: "header",
            required: true,
            schema: { type: "string" },
            description: "Unique Device ID for partitioning data",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "array", items: { type: "string" } },
            },
          },
        },
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: { type: "object", properties: { success: { type: "boolean" } } },
              },
            },
          },
        },
      },
    },
    "/api/guides": {
      get: {
        summary: "Retrieve guide articles",
        description: "Fetch all guide articles for Hololive Dreams.",
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Guide" } },
              },
            },
          },
        },
      },
    },
    "/api/admin/login": {
      post: {
        summary: "Admin login",
        description: "Exchange the admin password for a signed session token.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", properties: { password: { type: "string" } } },
            },
          },
        },
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: { type: "object", properties: { token: { type: "string" } } },
              },
            },
          },
          "401": { description: "Invalid password" },
        },
      },
    },
  },
  components: {
    schemas: {
      Character: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          title: { type: "string" },
          rarity: { type: "string" },
          group: { type: "string" },
          type: { type: "string" },
          accentColor: { type: "string" },
          image: { type: "string" },
          avatar: { type: "string" },
          stats: {
            type: "object",
            properties: {
              sense: { type: "integer" },
              technique: { type: "integer" },
              performance: { type: "integer" },
              support: { type: "integer" },
            },
          },
          skills: {
            type: "object",
            properties: {
              outfit: { type: "string" },
              special: { type: "string" },
              active: { type: "string" },
              passive: { type: "string" },
            },
          },
        },
      },
      Preset: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          team: { type: "array", items: { type: "string", nullable: true } },
          leader: { type: "string", nullable: true },
          isActive: { type: "boolean" },
        },
      },
      Guide: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          category: { type: "string" },
          readTime: { type: "string" },
          author: { type: "string" },
          date: { type: "string" },
          content: { type: "string" },
        },
      },
    },
  },
};

// Official Swagger UI sandbox for the public API.
router.get("/", (_req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>HoloDreams API Docs</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin:0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" charset="UTF-8"> </script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js" charset="UTF-8"> </script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        spec: ${JSON.stringify(openApiSpec)},
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [ SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset ],
        plugins: [ SwaggerUIBundle.plugins.DownloadUrl ],
        layout: "BaseLayout"
      });
      window.ui = ui;
    };
  </script>
</body>
</html>`;
  res.send(html);
});

export default router;
