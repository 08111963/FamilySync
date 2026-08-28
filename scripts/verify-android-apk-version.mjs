#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const [apkPath, expectedVersionName, expectedVersionCodeRaw] = process.argv.slice(2);

if (!apkPath || !expectedVersionName || !expectedVersionCodeRaw) {
  console.error(
    "Usage: node scripts/verify-android-apk-version.mjs <apk> <versionName> <versionCode>",
  );
  process.exit(2);
}

const expectedVersionCode = Number(expectedVersionCodeRaw);
if (!Number.isInteger(expectedVersionCode) || expectedVersionCode < 1) {
  console.error(`Invalid versionCode: ${expectedVersionCodeRaw}`);
  process.exit(2);
}

const readUInt16 = (buffer, offset) => buffer.readUInt16LE(offset);
const readUInt32 = (buffer, offset) => buffer.readUInt32LE(offset);

function readLength8(buffer, offset) {
  const first = buffer[offset];
  if ((first & 0x80) !== 0) {
    return [((first & 0x7f) << 8) | buffer[offset + 1], offset + 2];
  }
  return [first, offset + 1];
}

function readLength16(buffer, offset) {
  const first = readUInt16(buffer, offset);
  if ((first & 0x8000) !== 0) {
    return [
      ((first & 0x7fff) << 16) | readUInt16(buffer, offset + 2),
      offset + 4,
    ];
  }
  return [first, offset + 2];
}

function readStringPool(chunk) {
  const stringCount = readUInt32(chunk, 8);
  const flags = readUInt32(chunk, 16);
  const stringsStart = readUInt32(chunk, 20);
  const isUtf8 = (flags & 0x100) !== 0;
  const values = [];

  for (let index = 0; index < stringCount; index += 1) {
    let offset = stringsStart + readUInt32(chunk, 28 + index * 4);
    let byteLength;

    if (isUtf8) {
      [, offset] = readLength8(chunk, offset);
      [byteLength, offset] = readLength8(chunk, offset);
      values.push(chunk.toString("utf8", offset, offset + byteLength));
    } else {
      let characterLength;
      [characterLength, offset] = readLength16(chunk, offset);
      values.push(
        chunk.toString("utf16le", offset, offset + characterLength * 2),
      );
    }
  }

  return values;
}

function parseManifestAttributes(buffer) {
  const xmlStartElementType = 0x0102;
  let offset = readUInt16(buffer, 2);
  let stringPool;

  while (offset < buffer.length) {
    const type = readUInt16(buffer, offset);
    const size = readUInt32(buffer, offset + 4);
    if (type === 0x0001) {
      stringPool = readStringPool(buffer.subarray(offset, offset + size));
      break;
    }
    offset += size;
  }

  if (!stringPool) {
    throw new Error("Android manifest string pool not found");
  }

  offset = readUInt16(buffer, 2);
  while (offset < buffer.length) {
    const type = readUInt16(buffer, offset);
    const size = readUInt32(buffer, offset + 4);

    if (type === xmlStartElementType) {
      const elementName = stringPool[readUInt32(buffer, offset + 20)];
      if (elementName === "manifest") {
        const attributeStart = readUInt16(buffer, offset + 24);
        const attributeSize = readUInt16(buffer, offset + 26);
        const attributeCount = readUInt16(buffer, offset + 28);
        const attributes = {};

        for (let index = 0; index < attributeCount; index += 1) {
          const attributeOffset =
            offset + 16 + attributeStart + index * attributeSize;
          const name = stringPool[readUInt32(buffer, attributeOffset + 4)];
          const rawValueIndex = readUInt32(buffer, attributeOffset + 8);
          const dataType = buffer[attributeOffset + 15];
          const data = readUInt32(buffer, attributeOffset + 16);

          attributes[name] =
            dataType === 0x03 && rawValueIndex !== 0xffffffff
              ? stringPool[rawValueIndex]
              : data;
        }

        return attributes;
      }
    }

    offset += size;
  }

  throw new Error("Manifest root element not found");
}

try {
  const manifest = execFileSync(
    "unzip",
    ["-p", apkPath, "AndroidManifest.xml"],
    { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
  );
  const attributes = parseManifestAttributes(manifest);
  const actualVersionName = String(attributes.versionName);
  const actualVersionCode = Number(attributes.versionCode);

  console.log(
    JSON.stringify(
      {
        apk: apkPath,
        package: attributes.package,
        versionName: actualVersionName,
        versionCode: actualVersionCode,
      },
      null,
      2,
    ),
  );

  if (
    actualVersionName !== expectedVersionName ||
    actualVersionCode !== expectedVersionCode
  ) {
    console.error(
      `Expected ${expectedVersionName} (${expectedVersionCode}), got ${actualVersionName} (${actualVersionCode})`,
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}