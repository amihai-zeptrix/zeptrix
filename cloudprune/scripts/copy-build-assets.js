const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const source = path.join(projectRoot, "cloudprune");
const destination = path.join(projectRoot, "dist", "cloudprune");

fs.rmSync(destination, { force: true, recursive: true });
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.cpSync(source, destination, { recursive: true });
