import {createWriteStream} from "fs";

export const writeJsonFile = async (data: any[], outputPath: string) => {
  // Use stream to write to file to avoid memory issues
  const writeStream = createWriteStream(outputPath);
  writeStream.write('[');
  data.forEach((r, index) => {
    if(index > 0) writeStream.write(',');
    writeStream.write(JSON.stringify(r, null, 2));
  })
  writeStream.write(']');
  writeStream.end();

  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve as () => void);
    writeStream.on('error', reject);
  });
}

/**
 * Write a pretty-printed JSON array without building one giant string (avoids
 * RangeError: Invalid string length on very large outputs).
 */
export async function writeJsonArrayPretty(outputPath: string, rows: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(outputPath, {encoding: "utf-8"});
    stream.on("error", reject);
    stream.write("[\n");
    for (let i = 0; i < rows.length; i++) {
      if (i > 0) stream.write(",\n");
      const block = JSON.stringify(rows[i], null, 2);
      stream.write(block.split("\n").map((line) => "  " + line).join("\n"));
    }
    stream.write("\n]\n");
    stream.end();
    stream.on("finish", () => resolve());
  });
}
