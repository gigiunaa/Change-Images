import express from "express";
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import archiver from "archiver";
import multer from "multer";
import unzipper from "unzipper";

const app = express();
const upload = multer({ dest: "uploads/" });

// Healthcheck
app.get("/", (req, res) => {
  res.send("Server is running ✅");
});

app.post("/process", upload.array("files"), async (req, res) => {
  try {
    const zipFile = req.files.find(f => f.originalname.endsWith(".zip"));
    const htmlFile = req.files.find(f => f.originalname.endsWith(".html"));

    if (!htmlFile) {
      return res.status(400).send("❌ content.html not found");
    }

    const html = fs.readFileSync(htmlFile.path, "utf8");
    const $ = cheerio.load(html);

    // output images საქაღალდე
    const imagesDir = path.join("output", "images");
    fs.rmSync("output", { recursive: true, force: true });
    fs.mkdirSync(imagesDir, { recursive: true });

    let imgCounter = 1;

    if (zipFile) {
      const zipStream = fs.createReadStream(zipFile.path).pipe(unzipper.Parse({ forceStream: true }));
      for await (const entry of zipStream) {
        const fileName = entry.path;
        const ext = path.extname(fileName).toLowerCase();

        if (ext === ".zip" && fileName.includes("images")) {
          // თუ nested images.zipაა, გახსენი შიგნით
          const nestedBuffer = await entry.buffer();
          const nestedStream = unzipper.Parse({ forceStream: true });
          nestedStream.end(nestedBuffer);

          for await (const nestedEntry of nestedStream) {
            const nestedName = nestedEntry.path;
            const nestedExt = path.extname(nestedName).toLowerCase();

            if (nestedExt.match(/\.(png|jpg|jpeg|gif)$/i)) {
              const newName = `image${imgCounter}${nestedExt}`;
              const newPath = path.join(imagesDir, newName);

              await new Promise((resolve, reject) => {
                nestedEntry.pipe(fs.createWriteStream(newPath))
                  .on("finish", resolve)
                  .on("error", reject);
              });

              const imgTag = $("img").get(imgCounter - 1);
              if (imgTag) {
                $(imgTag).attr("src", `images/${newName}`);
              }
              imgCounter++;
            } else {
              nestedEntry.autodrain();
            }
          }
        } else if (ext.match(/\.(png|jpg|jpeg|gif)$/i)) {
          // ჩვეულებრივი სურათის დამუშავება
          const newName = `image${imgCounter}${ext}`;
          const newPath = path.join(imagesDir, newName);

          await new Promise((resolve, reject) => {
            entry.pipe(fs.createWriteStream(newPath))
              .on("finish", resolve)
              .on("error", reject);
          });

          const imgTag = $("img").get(imgCounter - 1);
          if (imgTag) {
            $(imgTag).attr("src", `images/${newName}`);
          }
          imgCounter++;
        } else {
          entry.autodrain();
        }
      }
    }

    // HTML შენახვა
    const outHtml = path.join("output", "index.html");
    fs.writeFileSync(outHtml, $.html(), "utf8");

    // პასუხის ZIP
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=archive.zip");

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);
    archive.file(outHtml, { name: "index.html" });
    archive.directory(imagesDir, "images");
    await archive.finalize();
  } catch (err) {
    console.error("❌ Processing failed:", err);
    res.status(500).send("Processing failed");
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
