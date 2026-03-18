#!/usr/bin/env node
/**
 * Generates Kibana Saved Objects .ndjson files from the simplified dashboard
 * JSON definitions in this directory.
 *
 * Compatible with Kibana 8.11+ (ES|QL support via textBased datasource).
 * The ndjson files can be imported via:
 *   - Kibana UI: Stack Management → Saved Objects → Import
 *   - npm run setup:dashboards:legacy  (uses /api/saved_objects/_import)
 *
 * Usage:
 *   node generate-ndjson.mjs
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "ndjson");

// ─── Deterministic UUID from a seed string ──────────────────────────────────

function seededUUID(seed) {
  const hash = createHash("sha1").update(seed).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "4" + hash.slice(13, 16),            // version 4
    ((parseInt(hash[16], 16) & 3) | 8).toString(16) + hash.slice(17, 20), // variant
    hash.slice(20, 32),
  ].join("-");
}

// ─── Lens state builders ─────────────────────────────────────────────────────

function buildPartitionLens(attrs, panelTitle) {
  const { dataset, metrics, group_by = [] } = attrs;
  const layerId = seededUUID(`layer:${panelTitle}:${dataset.query}`);

  const metricCols  = metrics.map(m  => ({ columnId: m.column,  fieldName: m.column  }));
  const groupCols   = group_by.map(g => ({ columnId: g.column,  fieldName: g.column  }));

  return {
    title: panelTitle || "",
    description: "",
    visualizationType: "lnsPie",
    type: "lens",
    references: [],
    state: {
      datasourceStates: {
        textBased: {
          layers: {
            [layerId]: {
              index: layerId,
              query: { esql: dataset.query },
              columns: [...groupCols, ...metricCols],
              timeField: "@timestamp",
              indexPatternRefs: [],
            },
          },
        },
      },
      visualization: {
        shape: attrs.type === "donut" ? "donut" : "pie",
        layers: [
          {
            layerId,
            primaryGroups:   groupCols.map(c => c.columnId),
            metric:          metrics[0].column,
            layerType:       "data",
            numberDisplay:   "percent",
            categoryDisplay: "default",
            legendDisplay:   "default",
          },
        ],
      },
      query: { query: "", language: "kuery" },
      filters: [],
    },
  };
}

function buildXYLens(attrs, panelTitle) {
  const { layers } = attrs;

  const dsLayers  = {};
  const vizLayers = [];

  for (let i = 0; i < layers.length; i++) {
    const layer   = layers[i];
    const layerId = seededUUID(`layer:${panelTitle}:${i}:${layer.dataset.query}`);
    const { type: seriesType, dataset, x, y } = layer;

    const xCols  = x ? [{ columnId: x.column, fieldName: x.column }] : [];
    const yCols  = y.map(ref => ({ columnId: ref.column, fieldName: ref.column }));

    dsLayers[layerId] = {
      index:            layerId,
      query:            { esql: dataset.query },
      columns:          [...xCols, ...yCols],
      timeField:        "@timestamp",
      indexPatternRefs: [],
    };

    vizLayers.push({
      layerId,
      accessors:   yCols.map(c => c.columnId),
      seriesType,
      xAccessor:   x?.column,
      layerType:   "data",
      yConfig:     yCols.map((c, yi) => ({
        forAccessor: c.columnId,
        ...(y[yi]?.label ? { axisMode: "left" } : {}),
      })),
    });
  }

  return {
    title:            panelTitle || "",
    description:      "",
    visualizationType: "lnsXY",
    type:             "lens",
    references:       [],
    state: {
      datasourceStates: {
        textBased: {
          layers: dsLayers,
        },
      },
      visualization: {
        preferredSeriesType: layers[0].type,
        legend:              { isVisible: true, position: "right" },
        valueLabels:         "hide",
        axisTitlesVisibilitySettings: { x: false, yLeft: false, yRight: false },
        layers:              vizLayers,
      },
      query:   { query: "", language: "kuery" },
      filters: [],
    },
  };
}

function buildLensAttributes(config) {
  const attrs = config.attributes ?? config;
  const title = config.title || "";
  if (attrs.type === "donut" || attrs.type === "pie") return buildPartitionLens(attrs, title);
  if (attrs.type === "xy")                             return buildXYLens(attrs, title);
  throw new Error(`Unsupported chart type: ${attrs.type}`);
}

// ─── Panel builder ───────────────────────────────────────────────────────────

function buildPanel(panel, dashTitle, index) {
  const panelId = seededUUID(`panel:${dashTitle}:${index}`);
  const lensAttrs = buildLensAttributes(panel.config);

  return {
    type:      "lens",
    gridData:  { x: panel.grid.x, y: panel.grid.y, w: panel.grid.w, h: panel.grid.h, i: panelId },
    panelIndex: panelId,
    embeddableConfig: {
      attributes:   lensAttrs,
      enhancements: {},
    },
    title: panel.config.title || "",
  };
}

// ─── Dashboard → ndjson line ─────────────────────────────────────────────────

function dashboardToSavedObject(def) {
  const id     = seededUUID(`dashboard:${def.title}`);
  const panels = def.panels.map((p, i) => buildPanel(p, def.title, i));

  const attributes = {
    title:       def.title,
    description: "",
    panelsJSON:  JSON.stringify(panels),
    optionsJSON: JSON.stringify({
      useMargins:     true,
      syncColors:     false,
      syncCursor:     true,
      syncTooltips:   false,
      hidePanelTitles: false,
    }),
    timeRestore: !!def.time_range,
    ...(def.time_range ? { timeFrom: def.time_range.from, timeTo: def.time_range.to } : {}),
    kibanaSavedObjectMeta: {
      searchSourceJSON: JSON.stringify({
        query:  { query: "", language: "kuery" },
        filter: [],
      }),
    },
  };

  return {
    id,
    type:                  "dashboard",
    namespaces:            ["default"],
    attributes,
    references:            [],
    coreMigrationVersion:  "8.8.0",
    typeMigrationVersion:  "8.9.0",
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

mkdirSync(OUTPUT_DIR, { recursive: true });

const files = readdirSync(__dirname).filter(f => f.endsWith("-dashboard.json"));

if (files.length === 0) {
  console.log("No *-dashboard.json files found.");
  process.exit(0);
}

for (const file of files) {
  const def      = JSON.parse(readFileSync(join(__dirname, file), "utf-8"));
  const obj      = dashboardToSavedObject(def);
  const outFile  = join(OUTPUT_DIR, file.replace(".json", ".ndjson"));

  writeFileSync(outFile, JSON.stringify(obj) + "\n");
  console.log(`  ✓ ${outFile.replace(__dirname + "/", "")}`);
}

console.log(`\nGenerated ${files.length} ndjson file(s) in ndjson/`);
console.log("Import via Kibana: Stack Management → Saved Objects → Import");
console.log("Import via CLI:    npm run setup:dashboards:legacy");
