#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function requiredArg(args, key) {
  const value = args[key];
  if (!value) {
    throw new Error(`Missing required argument --${key}`);
  }
  return value;
}

function normalizePubDate(raw) {
  const value = (raw || '').trim();
  if (!value || value === 'true' || value === 'null') {
    throw new Error(`Invalid --published-at value: "${raw}"`);
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid --published-at value: "${raw}"`);
  }
  return new Date(timestamp).toISOString();
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim();
}

function buildUrl(repo, version, fileName) {
  const encoded = encodeURIComponent(fileName);
  return `https://github.com/${repo}/releases/download/v${version}/${encoded}`;
}

function findAsset(assets, pattern, label) {
  const hit = assets.find((name) => pattern.test(name));
  if (!hit) {
    throw new Error(`Missing required updater asset for ${label}. Pattern: ${pattern}`);
  }
  return hit;
}

function buildPlatformEntry(assetName, signatures, repo, version) {
  const signature = signatures.get(assetName);
  if (!signature) {
    throw new Error(`Missing signature file for asset ${assetName}`);
  }
  return {
    signature,
    url: buildUrl(repo, version, assetName),
  };
}

function cloneEntry(entry) {
  return { signature: entry.signature, url: entry.url };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = requiredArg(args, 'version');
  const repo = requiredArg(args, 'repo');
  const assetsDir = requiredArg(args, 'assets-dir');
  const notesFile = requiredArg(args, 'notes-file');
  const publishedAt = normalizePubDate(requiredArg(args, 'published-at'));
  const output = args.output || 'latest.json';

  if (!fs.existsSync(assetsDir) || !fs.statSync(assetsDir).isDirectory()) {
    throw new Error(`Assets directory not found: ${assetsDir}`);
  }
  if (!fs.existsSync(notesFile)) {
    throw new Error(`Notes file not found: ${notesFile}`);
  }

  const files = fs
    .readdirSync(assetsDir)
    .filter((name) => fs.statSync(path.join(assetsDir, name)).isFile());

  const signatures = new Map();
  for (const name of files) {
    if (!name.endsWith('.sig')) continue;
    const assetName = name.slice(0, -4);
    signatures.set(assetName, readText(path.join(assetsDir, name)));
  }

  const assets = files.filter(
    (name) => !name.endsWith('.sig') && name !== 'latest.json' && name !== 'SHA256SUMS.txt'
  );

  const platforms = {};

  const darwinAarch64Tar = assets.find((name) => /_aarch64\.app\.tar\.gz$/.test(name));
  if (darwinAarch64Tar) {
    const entry = buildPlatformEntry(darwinAarch64Tar, signatures, repo, version);
    platforms['darwin-aarch64'] = entry;
    platforms['darwin-aarch64-app'] = cloneEntry(entry);
  }

  const darwinX64Tar = assets.find((name) => /_x64\.app\.tar\.gz$/.test(name));
  if (darwinX64Tar) {
    const entry = buildPlatformEntry(darwinX64Tar, signatures, repo, version);
    platforms['darwin-x86_64'] = entry;
    platforms['darwin-x86_64-app'] = cloneEntry(entry);
  }

  const windowsMsi = assets.find((name) => /_x64_en-US\.msi$/.test(name));
  if (windowsMsi) {
    const entry = buildPlatformEntry(windowsMsi, signatures, repo, version);
    platforms['windows-x86_64'] = entry;
    platforms['windows-x86_64-msi'] = cloneEntry(entry);
  }

  const windowsNsis = assets.find((name) => /_x64-setup\.exe$/.test(name));
  if (windowsNsis) {
    const entry = buildPlatformEntry(windowsNsis, signatures, repo, version);
    platforms['windows-x86_64-nsis'] = entry;
    if (!platforms['windows-x86_64']) {
      platforms['windows-x86_64'] = cloneEntry(entry);
    }
  }

  const linuxX64AppImage = assets.find((name) => /_amd64\.AppImage$/.test(name));
  if (linuxX64AppImage) {
    const entry = buildPlatformEntry(linuxX64AppImage, signatures, repo, version);
    platforms['linux-x86_64'] = entry;
    platforms['linux-x86_64-appimage'] = cloneEntry(entry);
  }

  const linuxArmAppImage = assets.find((name) => /_aarch64\.AppImage$/.test(name));
  if (linuxArmAppImage) {
    const entry = buildPlatformEntry(linuxArmAppImage, signatures, repo, version);
    platforms['linux-aarch64'] = entry;
    platforms['linux-aarch64-appimage'] = cloneEntry(entry);
  }

  const linuxX64Deb = assets.find((name) => /_amd64\.deb$/.test(name));
  if (linuxX64Deb) {
    platforms['linux-x86_64-deb'] = buildPlatformEntry(linuxX64Deb, signatures, repo, version);
  }

  const linuxArmDeb = assets.find((name) => /_arm64\.deb$/.test(name));
  if (linuxArmDeb) {
    platforms['linux-aarch64-deb'] = buildPlatformEntry(linuxArmDeb, signatures, repo, version);
  }

  const linuxX64Rpm = assets.find((name) => /-1\.x86_64\.rpm$/.test(name));
  if (linuxX64Rpm) {
    platforms['linux-x86_64-rpm'] = buildPlatformEntry(linuxX64Rpm, signatures, repo, version);
  }

  const linuxArmRpm = assets.find((name) => /-1\.aarch64\.rpm$/.test(name));
  if (linuxArmRpm) {
    platforms['linux-aarch64-rpm'] = buildPlatformEntry(linuxArmRpm, signatures, repo, version);
  }

  const latest = {
    version,
    notes: readText(notesFile),
    pub_date: publishedAt,
    platforms,
  };

  fs.writeFileSync(output, `${JSON.stringify(latest, null, 2)}\n`);
  console.log(`Merged latest.json generated at ${output}`);
  console.log(`platform count=${Object.keys(latest.platforms).length}`);
}

try {
  main();
} catch (error) {
  console.error(`[build_merged_latest_json] ${error.message}`);
  process.exit(1);
}
