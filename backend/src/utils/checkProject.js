const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.join(__dirname, "..");

function collectJsFiles(dir, result = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collectJsFiles(fullPath, result);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      result.push(fullPath);
    }
  }

  return result;
}

const files = collectJsFiles(rootDir);

let hasError = false;

for (const file of files) {
  const relative = path.relative(process.cwd(), file);
  const result = spawnSync("node", ["--check", file], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    hasError = true;
    console.error(`ERROR: ${relative}`);
    console.error(result.stderr || result.stdout);
  } else {
    console.log(`OK: ${relative}`);
  }
}

if (hasError) {
  process.exit(1);
}

console.log(`\nChequeo completo OK. Archivos revisados: ${files.length}`);
