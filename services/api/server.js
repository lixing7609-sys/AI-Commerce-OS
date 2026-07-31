import http from "node:http";
import { createStore } from "./loop.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4700;
const store = createStore();

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const routes = [
  { method: "GET", pattern: /^\/api\/state$/, handler: (_m, res) => json(res, 200, store.getState()) },
  {
    method: "POST",
    pattern: /^\/api\/reset$/,
    handler: (_m, res) => json(res, 200, store.reset()),
  },
  {
    method: "POST",
    pattern: /^\/api\/opportunities$/,
    handler: async (_m, res, req) => {
      const body = await readBody(req);
      json(res, 201, store.createOpportunity(body));
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/opportunities\/([^/]+)\/strategy$/,
    handler: (match, res) => {
      try {
        json(res, 201, store.generateStrategy(match[1]));
      } catch (err) {
        json(res, 404, { error: err.message });
      }
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/content$/,
    handler: async (_m, res, req) => {
      const { strategyId } = await readBody(req);
      try {
        json(res, 201, store.createContent(strategyId));
      } catch (err) {
        json(res, 400, { error: err.message });
      }
    },
  },
  {
    method: "PATCH",
    pattern: /^\/api\/content\/([^/]+)$/,
    handler: async (match, res, req) => {
      const { stage } = await readBody(req);
      try {
        json(res, 200, store.advanceContent(match[1], stage));
      } catch (err) {
        json(res, 404, { error: err.message });
      }
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/content\/([^/]+)\/submit-approval$/,
    handler: (match, res) => {
      try {
        json(res, 201, store.submitForApproval(match[1]));
      } catch (err) {
        json(res, 400, { error: err.message });
      }
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/approvals\/([^/]+)\/decide$/,
    handler: async (match, res, req) => {
      const { decision } = await readBody(req);
      try {
        json(res, 200, store.decideApproval(match[1], decision));
      } catch (err) {
        json(res, 400, { error: err.message });
      }
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/publish$/,
    handler: async (_m, res, req) => {
      const { contentId, channel } = await readBody(req);
      try {
        json(res, 201, store.publish(contentId, channel));
      } catch (err) {
        json(res, 400, { error: err.message });
      }
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/publish\/([^/]+)\/metrics$/,
    handler: async (match, res, req) => {
      const metrics = await readBody(req);
      try {
        json(res, 200, store.recordMetrics(match[1], metrics));
      } catch (err) {
        json(res, 400, { error: err.message });
      }
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/orders\/([^/]+)\/settle$/,
    handler: (match, res) => {
      try {
        json(res, 200, store.settleOrder(match[1]));
      } catch (err) {
        json(res, 400, { error: err.message });
      }
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/cloud\/tick$/,
    handler: async (_m, res, req) => {
      const { amount } = await readBody(req);
      json(res, 200, store.tickCloudUsage(amount));
    },
  },
];

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));

  if (!route) {
    return json(res, 404, { error: `no route for ${req.method} ${url.pathname}` });
  }

  const match = route.pattern.exec(url.pathname);
  try {
    await route.handler(match, res, req);
  } catch (err) {
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`[sinofut-api] mock loop backend listening on http://localhost:${PORT}`);
});
