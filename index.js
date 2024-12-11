import { Telegraf } from "telegraf";
import mongoose from "mongoose";
import { config } from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import axios from "axios";

config();

// === MongoDB Sozlamalari ===
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("dataBase connected");
  });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Zarur bo'lsa, qaysi domenlarga ruxsat berilishini aniqlang
  },
});

// === Fayl modeli ===
const fileSchema = new mongoose.Schema({
  fileId: String,
  fileName: String,
  fileType: String,
  uniqueCode: String,
  uploadedAt: { type: Date, default: Date.now },
});

const File = mongoose.model("File", fileSchema);

// === Telegram Botni sozlash ===
const bot = new Telegraf(process.env.BOT_TOKEN); // Bot tokeningizni `.env` faylida saqlang

// === Fayl qabul qilish tugmasi ===
bot.start((ctx) => {
  ctx.reply(
    "Salom! Faqat hujjatlar (masalan, PDF, DOCX, EXCEL) fayllarini yuborishingiz mumkin."
  );
});

// === 4 xonali unikal kod yaratish funksiyasi ===
function generateUniqueCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// === Ruxsat etilgan fayl turlari ro'yxati ===
const allowedFileTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
];

// === Fayllarni qabul qilish ===
bot.on("document", async (ctx) => {
  try {
    const file = ctx.message.document;

    if (!allowedFileTypes.includes(file.mime_type)) {
      return ctx.reply(
        "Faqat quyidagi fayl turlari qabul qilinadi: PDF, DOCX, EXCEL."
      );
    }

    const uniqueCode = generateUniqueCode();

    const fileData = {
      fileId: file.file_id,
      fileName: file.file_name || `file_${Date.now()}`,
      fileType: file.mime_type,
      uniqueCode,
    };

    const savedFile = new File(fileData);
    await savedFile.save();

    await ctx.reply(
      `Fayl qabul qilindi! Unikal kod: ${uniqueCode}. Ushbu kodni nusxa chiqarishda kiriting.`
    );

    await ctx.telegram.sendDocument(ctx.chat.id, file.file_id);

    // === Faylni apparatga real vaqt rejimida yuborish ===
    io.emit("newFile", fileData); // Faylni apparatga yuborish uchun event
  } catch (error) {
    console.error(error);
    ctx.reply("Faylni qabul qilishda xatolik yuz berdi.");
  }
});

// === Fayllarni yuklab olish uchun link yaratish ===
async function getFileLink(bot, fileId) {
  const file = await bot.telegram.getFile(fileId);
  return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
}

app.get("/files", async (req, res) => {
  try {
    const files = await File.find();
    const filesWithLinks = await Promise.all(
      files.map(async (file) => {
        const fileLink = await getFileLink(bot, file.fileId);
        return {
          ...file.toObject(),
          fileLink,
        };
      })
    );
    res.json(filesWithLinks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Fayllarni olishda xatolik yuz berdi." });
  }
});

app.get("/download/:fileId", async (req, res) => {
  try {
    const file = await File.findOne({ fileId: req.params.fileId });
    if (!file) {
      return res.status(404).json({ error: "Fayl topilmadi" });
    }

    const fileLink = await getFileLink(bot, file.fileId);

    const response = await axios({
      method: "get",
      url: fileLink,
      responseType: "stream",
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${file.fileName}`
    );
    res.setHeader("Content-Type", file.fileType);

    response.data.pipe(res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Faylni yuklashda xatolik yuz berdi." });
  }
});
// === HTTP serverni ishga tushirish ===
server.listen(3001, () => {
  console.log("Server 3001 portda ishga tushdi");
});
