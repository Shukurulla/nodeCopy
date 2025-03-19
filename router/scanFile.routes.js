import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import scanFileModel from "../model/scanFile.model.js";

const router = express.Router();

// Multer konfiguratsiyasi
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "public/scan-file";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// 5 xonali noyob kod yaratish
const generateUniqueCode = async () => {
  let code;
  let exists = true;
  do {
    code = Math.floor(10000 + Math.random() * 90000).toString();
    exists = await scanFileModel.exists({ code });
  } while (exists);
  return code;
};

// 1-chi router: Foydalanuvchiga 5 xonali noyob kod qaytarish
router.get("/generate", async (req, res) => {
  try {
    const code = await generateUniqueCode();
    res.json({ code });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2-chi router: Faylni yuklash va bazaga qo‘shish
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { code } = req.body;
    const file = req.file;

    if (!code || !file) {
      return res.status(400).json({ error: "Kod va fayl talab qilinadi" });
    }

    // Kod mavjudligini tekshirish
    const existing = await scanFileModel.findOne({ code });
    if (existing) {
      return res.status(400).json({ error: "Bu kod allaqachon ishlatilgan" });
    }

    // Fayl yo‘lini saqlash
    const scanFile = await scanFileModel.create({
      code,
      file: file.path,
    });

    res.json({ message: "Fayl saqlandi", data: scanFile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
