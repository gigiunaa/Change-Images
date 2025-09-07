import express from "express";
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
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
    // მოძებნე content.html
    const htmlFile = req.files.find(f => f.originalname.endsWith(".html"));
    if (!htmlFile) {
      console.error("❌ content.html not found in uploaded files");
      return res.status(400).send("content.html not found");
    }

    const html = fs.readFileSync(htmlFile.path, "utf8");
    const $ = cheerio.load(html);

    // ახალი images საქაღალდის მომზადება
    const imagesDir = path.join("output", "images");
    fs.rmSync("output", { recursive: true, force: true });
    fs.mkdirSync(imagesDir, { recursive: true });

    // ყველა <img>
    const imgTags = $("img").toArray();

    // ყველა ატვირთული ფაილი (გარდა html-ის)
    const uploadedImages = req.files.filter(f => !f.originalname.endsWith(".html"));

    // Debug logs
    console.log("Uploaded files:", req.files.map(f => f.originalname));
    console.log("Uploaded images (excluding html):", uploadedImages.map(f => f.originalname));
    console.log("Found <img> tags in HTML:", imgTags.length);

    // მხოლოდ იმდენი ვამუშავოთ, რამდენიც ორივეგან არის
    const count = Math.min(imgTags.length, uploadedImages.length);

    for (let i = 0; i < count; i++) {
      const file = uploadedImages[i];
      const ext = path.extname(file.originalname) || ".png";
      const newName = `image${i + 1}${ext}`;
      const newPath = path.join(imagesDir, newName);

      fs.copyFileSync(file.path, newPath);
      imgTags[i].attribs.src = `images/${newName}`;

      console.log(`✔️ ${file.originalname} → ${newName}`);
    }

    // შევინახოთ ახალი HTML
    const outHtml = path.join("output", "index.html");
    fs.writeFileSync(outHtml, $.html(), "utf8");

    // შევკრათ ZIP
    res.attachment("archive.zip");
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);
    archive.file(outHtml, { name: "index.html" });
    archive.directory(imagesDir, "images");
    await archive.finalize();
  } catch (err) {
    console.error("❌ Error while processing:", err);
    res.status(500).send("Processing failed");
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
