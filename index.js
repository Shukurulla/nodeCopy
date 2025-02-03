import { Telegraf, Markup } from "telegraf";
import mongoose from "mongoose";
import { config } from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import axios from "axios";
import fs from "fs";
import https from "https";

config();

// === MongoDB Sozlamalari ===
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Database connected");
  });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// === Fayl modeli ===
const fileSchema = new mongoose.Schema({
  fileId: String,
  fileName: String,
  fileType: String,
  uniqueCode: String,
  uploadedAt: { type: Date, default: Date.now },
  user: {
    username: String,
    firstName: String,
    lastName: String,
    profilePic: String,
  },
});

const File = mongoose.model("File", fileSchema);

// === Telegram Botni sozlash ===
const bot = new Telegraf(process.env.BOT_TOKEN);

// === Unikal kod yaratish funksiyasi ===
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

// === Start tugmasi ===
bot.start((ctx) => {
  ctx.reply(
    `Salom, ${ctx.from.first_name || "foydalanuvchi"}! 
📂 Fayl yuborish uchun quyidagi tugmani bosing.`,
    Markup.keyboard([["📤 Fayl yuborish"]])
      .resize()
      .oneTime()
  );
});

// === Fayllarni qabul qilish ===
bot.hears("📤 Fayl yuborish", (ctx) => {
  ctx.reply(
    "Faylingizni yuboring. Faqat quyidagi fayl turlari qabul qilinadi: PDF, DOCX, EXCEL."
  );
});

bot.on("document", async (ctx) => {
  try {
    const file = ctx.message.document;
    const user = ctx.message.from;

    // Fayl turini tekshirish
    if (!allowedFileTypes.includes(file.mime_type)) {
      return ctx.reply(
        "Faqat quyidagi fayl turlari qabul qilinadi: PDF, DOCX."
      );
    }

    // Unikal kod yaratish
    const uniqueCode = generateUniqueCode();
    // Foydalanuvchi profil rasmini olish
    const photos = await bot.telegram.getUserProfilePhotos(user.id);
    const userProfilePhoto =
      photos.total_count > 0
        ? await bot.telegram.getFileLink(photos.photos[0][0].file_id)
        : null;
    // Fayl ma’lumotlarini saqlash
    const fileData = {
      fileId: file.file_id,
      fileName: file.file_name || `file_${Date.now()}`,
      fileType: file.mime_type,
      uniqueCode,
      user: {
        username: user.username || "Noma'lum",
        firstName: user.first_name || "Noma'lum",
        lastName: user.last_name || "",
        profilePic: userProfilePhoto,
      },
    };

    const savedFile = new File(fileData);
    await savedFile.save();

    // Yuboriladigan xabar matni
    const caption = `✅ Fayl qabul qilindi! 
📄 Fayl nomi: ${fileData.fileName}
🔑 Unikal kod: ${uniqueCode}
👤 Foydalanuvchi: ${fileData.user.username || "Noma'lum"}
    
Ushbu kodni saqlab qo'ying.`;

    // Profil rasmi mavjud bo‘lsa, uni yuborish
    if (fileData.user.profilePic) {
      await ctx.telegram.sendMessage(ctx.chat.id, caption);
    } else {
      // Profil rasmi bo‘lmasa, faqat matn yuboriladi
      await ctx.reply(caption);
    }

    // Fayl haqida ma'lumotni real vaqt rejimida yuborish
    io.emit("newFile", fileData);
  } catch (error) {
    console.error("Xatolik:", error);
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

app.delete("/all-delete", async (req, res) => {
  try {
    const files = await File.find();
    for (let i = 0; i < files.length; i++) {
      await File.findByIdAndDelete(files[i]._id);
    }
    res.json(files);
  } catch (error) {
    res.json(error.message);
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

// Botni polling rejimida ishga tushirish
bot.launch({
  polling: {
    interval: 300,
    timeout: 10,
    limit: 100,
  },
});

// Serverni ishga tushurish
const PORT = process.env.PORT || 8002;
server.listen(PORT, () => {
  console.log(`Server ${PORT}-portda ishlayapti`);
});
