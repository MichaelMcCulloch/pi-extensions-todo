#!/usr/bin/env node
/** Check the safety core, rank-based acyclicity, heap partition and iterative presentation proofs. */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const specDir = resolve(root, "spec");
const PROOFS = ["TodoSystemProof.tla", "TodoAcyclicProof.tla", "TodoHeapProof.tla", "TodoPresentationProof.tla"];

function findTlapm() {
  const candidates = [
    process.env.TLAPM,
    resolve(process.env.HOME ?? "", ".local/tlapm/bin/tlapm"),
    "/usr/local/bin/tlapm",
    "/usr/bin/tlapm",
  ].filter((candidate) => typeof candidate === "string" && candidate.length > 0);
  for (const candidate of candidates) {
    if (candidate === "tlapm" || existsSync(candidate)) return candidate;
  }
  return "tlapm";
}

function findStdlib(tlapm) {
  if (process.env.TLAPM_LIBRARY) return process.env.TLAPM_LIBRARY;
  const candidates = [
    resolve(dirname(tlapm), "..", "lib/tlapm/stdlib"),
    resolve(process.env.HOME ?? "", ".local/tlapm/lib/tlapm/stdlib"),
    "/usr/local/lib/tlapm/stdlib",
    "/usr/lib/tlapm/stdlib",
  ];
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, "TLAPS.tla"))) return candidate;
  }
  return undefined;
}

function main() {
  const tlapm = findTlapm();
  const stdlib = findStdlib(tlapm);
  const args = [];
  if (stdlib) args.push("-I", stdlib);
  args.push("--strict", "--debug", "oldsmt");
  for (const proof of PROOFS) {
    const proofArgs = [...args, proof];

    process.stdout.write(`\n$ (cd spec && ${tlapm} ${proofArgs.join(" ")})\n`);
    const result = spawnSync(tlapm, proofArgs, {
      cwd: specDir,
      stdio: "inherit",
      env: { ...process.env, PATH: `${dirname(tlapm)}${delimiter}${process.env.PATH ?? ""}` },
    });
    if (result.error) {
      process.stderr.write(
        `\nTLAPS not available (${result.error.message}).\n` +
          "Install tlapm 1.6+ (e.g. https://github.com/tlaplus/tlapm/releases) and a Z3 on PATH,\n" +
          "or set TLAPM and TLAPM_LIBRARY.\n",
      );
      process.exit(1);
    }
    if (result.status !== 0) {
      process.stderr.write(`\ninductive proof failed (tlapm exit ${result.status ?? "signal"})\n`);
      process.exit(1);
    }
  }
  process.stdout.write("inductive safety and presentation proofs passed under their stated assumptions\n");
}

main();
