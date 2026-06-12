import { scanFile } from "./malwareScan.service.js";

// Thin adapter used by VT queue worker.
export const scanFileWithVT = async (filePath, filename = null) => {
  const result = await scanFile(filePath);

  return {
    ...result,
    filename,
    engine: result.engine || "virustotal"
  };
};

export default {
  scanFileWithVT
};