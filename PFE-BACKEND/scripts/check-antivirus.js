import fs from "fs-extra";
import os from "os";
import path from "path";

import {
  isClamAVHealthy,
  getClamAVInfo,
  scanFileWithClamAV
} from "../services/clamav.service.js";

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

const run = async () => {
  console.log("=== Antivirus Connectivity Check ===");

  const healthy = await isClamAVHealthy();
  const info = await getClamAVInfo();

  console.log("ClamAV healthy:", healthy);
  console.log("ClamAV info:", info);

  const tempFilePath = path.join(os.tmpdir(), `eicar-${Date.now()}.txt`);
  await fs.writeFile(tempFilePath, EICAR, "utf8");

  try {
    const result = await scanFileWithClamAV(tempFilePath, "eicar-test.txt");
    console.log("EICAR scan result:", {
      isInfected: result.isInfected,
      engine: result.engine,
      virusCount: result.viruses?.length || 0,
      warning: result.warning || null,
      error: result.error || null
    });

    if (result.isInfected) {
      console.log("PASS: Antivirus detected EICAR test signature.");
      process.exitCode = 0;
      return;
    }

    console.log("FAIL: EICAR was not detected.");
    process.exitCode = 2;
  } finally {
    await fs.remove(tempFilePath).catch(() => {});
  }
};

run().catch((error) => {
  console.error("Antivirus check failed:", error.message);
  process.exitCode = 1;
});
