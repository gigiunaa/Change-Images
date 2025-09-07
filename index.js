import express from "express";
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";   // ⬅️ გასწორებულია
import archiver from "archiver";
import multer from "multer";

const app = express();
const upload = multer({ dest: "uploads/" });

// Healthcheck
app.get("/", (req, res) => {
  res.send("Server is running ✅");
});

// მთავარი ZIP გენერაციის endpoint
app.post("/process", upload.array("files"), async (req, res) => {
  try {
    const htmlFile = req.files.find(f => f.originalname.endsWith(".html"));
    if (!htmlFile) return res.status(400).send("content.html not found");

    const html = fs.readFileSync(htmlFile.path, "utf8");
    const $ = cheerio.load(html);

    const imagesDir = path.join("output", "images");
    fs.rmSync("output", { recursive: true, force: true });
    fs.mkdirSync(imagesDir, { recursive: true });

    let counter = 1;
    for (const img of $("img").toArray()) {
      const src = $(img).attribs.src;
      if (!src || /^(http|https|data:)/.test(src)) continue;

      const file = req.files.find(f => f.originalname === src);
      if (!file) continue;

      const ext = path.extname(src) || ".png";
      const newName = `image${counter}${ext}`;
      const newPath = path.join(imagesDir, newName);

      fs.copyFileSync(file.path, newPath);
      $(img).attribs.src = `images/${newName}`;
      counter++;
    }

    const outHtml = path.join("output", "index.html");
    fs.writeFileSync(outHtml, $.html(), "utf8");

    res.attachment("archive.zip");
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);
    archive.file(outHtml, { name: "index.html" });
    archive.directory(imagesDir, "images");
    await archive.finalize();
  } catch (err) {
    console.error(err);
    res.status(500).send("Processing failed");
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
