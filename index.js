import express from "express";
import fs from "fs";
import path from "path";
import cheerio from "cheerio";
import archiver from "archiver";
import multer from "multer";

const app = express();
const upload = multer({ dest: "uploads/" });

// Upload HTML + სურათების ფაილები
app.post("/process", upload.array("files"), async (req, res) => {
  try {
    // მოძებნე content.html
    const htmlFile = req.files.find(f => f.originalname.endsWith(".html"));
    if (!htmlFile) return res.status(400).send("content.html not found");

    const html = fs.readFileSync(htmlFile.path, "utf8");
    const $ = cheerio.load(html);

    // images/ საქაღალდე
    const imagesDir = path.join("output", "images");
    fs.rmSync("output", { recursive: true, force: true });
    fs.mkdirSync(imagesDir, { recursive: true });

    let counter = 1;
    for (const img of $("img").toArray()) {
      const src = $(img).attr("src");
      if (!src || /^(http|https|data:)/.test(src)) continue;

      // მოძებნე შესაბამისი ატვირთული სურათი
      const file = req.files.find(f => f.originalname === src);
      if (!file) continue;

      const ext = path.extname(src) || ".png";
      const newName = `image${counter}${ext}`;
      const newPath = path.join(imagesDir, newName);

      fs.copyFileSync(file.path, newPath);
      $(img).attr("src", `images/${newName}`);
      counter++;
    }

    // ჩაწერე index.html
    const outHtml = path.join("output", "index.html");
    fs.writeFileSync(outHtml, $.html(), "utf8");

    // შეკარი ZIP
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
