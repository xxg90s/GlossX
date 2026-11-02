const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const resources = path.join(root, "Shared (Extension)/Resources");
const out = path.join(root, "dist/chrome");
const keepDirs = new Set(["images", "_locales"]);
const flattenDirs = new Set(["lib", "data"]);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const entry of fs.readdirSync(resources, { withFileTypes: true })) {
    if (entry.name === "manifest.json") continue;
    const src = path.join(resources, entry.name);
    if (entry.isDirectory() && keepDirs.has(entry.name)) {
        fs.cpSync(src, path.join(out, entry.name), { recursive: true });
        continue;
    }
    if (entry.isDirectory() && flattenDirs.has(entry.name)) {
        for (const file of fs.readdirSync(src, { withFileTypes: true })) {
            if (!file.isFile()) continue;
            fs.copyFileSync(path.join(src, file.name), path.join(out, file.name));
        }
        continue;
    }
    if (entry.isDirectory()) {
        fs.cpSync(src, path.join(out, entry.name), { recursive: true });
        continue;
    }
    fs.copyFileSync(src, path.join(out, entry.name));
}

const safari = JSON.parse(fs.readFileSync(path.join(resources, "manifest.json"), "utf8"));
const chrome = {
    ...safari,
    background: {
        service_worker: "service-worker.js"
    },
    permissions: (safari.permissions || []).filter((name) => name !== "nativeMessaging")
};
const workerScripts = (safari.background?.scripts || [])
    .map((name) => `    "${name}"`)
    .join(",\n");
fs.writeFileSync(
    path.join(out, "service-worker.js"),
    `importScripts(\n${workerScripts}\n);\n`
);
fs.writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(chrome, null, 4)}\n`);
