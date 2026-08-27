import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const source = path.join(root, "assets/images/og-image.svg");
const output = path.join(root, "assets/images/og-image.png");

await sharp(await fs.readFile(source))
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`Generated ${path.relative(root, output)} (1200x630 PNG)`);