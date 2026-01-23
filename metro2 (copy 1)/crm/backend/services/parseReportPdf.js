import { spawn } from "child_process";

export function parseIdentityIqPdfToJson(pdfPath) {
  return new Promise((resolve, reject) => {
    const py = spawn("python", [
      "backend/parsers/identityiq_pdf_parser.py",
      pdfPath,
    ]);

    let out = "";
    let err = "";

    py.stdout.on("data", (data) => {
      out += data.toString("utf8");
    });
    py.stderr.on("data", (data) => {
      err += data.toString("utf8");
    });
    py.on("error", (error) => {
      reject(new Error(`PDF parse failed to start: ${error.message}`));
    });

    py.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`PDF parse failed (${code}): ${err}`));
        return;
      }
      try {
        resolve(JSON.parse(out));
      } catch (parseError) {
        reject(new Error(`PDF parse returned invalid JSON: ${parseError.message}`));
      }
    });
  });
}
