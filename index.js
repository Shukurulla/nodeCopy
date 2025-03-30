import { Telegraf, Markup } from "telegraf";
import mongoose from "mongoose";
import { config } from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import axios from "axios";
import cors from "cors";

config();

// MongoDB ulanishi
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Database connected"))
  .catch((err) => console.error("Database connection error:", err));

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Fayl modeli
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
const bot = new Telegraf(process.env.BOT_TOKEN);

// Ruxsat etilgan fayl turlari
const allowedFileTypes = [
  "application/pdf", // PDF
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
  "application/msword", // DOC
  "application/vnd.oasis.opendocument.text", // ODT
  "text/plain", // TXT
  "application/vnd.ms-powerpoint", // PPT
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // PPTX
];

const allowedExtensions = [
  ".pdf",
  ".doc",
  ".docx",
  ".odt",
  ".txt",
  ".ppt",
  ".pptx",
];
const usersReadyToSendFiles = new Set();

// Start komandasi
bot.start((ctx) => {
  ctx.reply(
    `Salom, ${ctx.from.first_name || "foydalanuvchi"}!\n` +
      `📂 Fayl yuborish yoki skan faylni olish uchun tugmalardan birini tanlang.\n` +
      `❗️ Qabul qilinadigan fayllar: PDF, Word, PowerPoint, ODT, TXT`,
    Markup.keyboard([["📤 Fayl yuborish"], ["📋 Scan faylni olish"]])
      .resize()
      .oneTime()
  );
});

// Scan faylni olish
bot.hears("📋 Scan faylni olish", (ctx) => {
  ctx.reply("Iltimos, kodni kiriting:");

  // Kod kiritilishini kutish
  bot.on("text", async (ctx) => {
    const code = ctx.message.text.trim();
    try {
      const file = await File.findOne({ uniqueCode: code });
      if (!file) {
        return ctx.reply("❌ Kechirasiz, ushbu kodga mos fayl topilmadi.");
      }

      // Fayl havolasini olish
      const fileLink = await getFileLink(file.fileId);

      // Faylni yuborish
      await ctx.replyWithDocument(fileLink, {
        caption:
          `📁 Fayl topildi!\n` +
          `🔑 Kod: ${file.uniqueCode}\n` +
          `📆 Yuklangan sana: ${file.uploadedAt.toLocaleString()}\n` +
          `👤 Yuboruvchi: ${file.user.username || file.user.firstName}`,
      });
    } catch (error) {
      console.error("Fayl qidirish xatosi:", error);
      ctx.reply("❌ Faylni olishda xatolik yuz berdi.");
    }
  });
});

// Fayl yuborish
bot.hears("📤 Fayl yuborish", (ctx) => {
  usersReadyToSendFiles.add(ctx.from.id);
  ctx.reply(
    "📎 Iltimos, faylingizni yuboring. Qabul qilinadigan formatlar:\n" +
      "• PDF, Word (DOC/DOCX)\n" +
      "• PowerPoint (PPT/PPTX)\n" +
      "• OpenDocument (ODT)\n" +
      "• Tekst (TXT)\n\n" +
      "❌ Excel fayllari qabul qilinmaydi!"
  );
});

// Fayl qabul qilish
bot.on("document", async (ctx) => {
  if (!usersReadyToSendFiles.has(ctx.from.id)) {
    return ctx.reply('❌ Avval "📤 Fayl yuborish" tugmasini bosing.');
  }

  try {
    const file = ctx.message.document;
    const user = ctx.message.from;

    // Fayl formatini tekshirish
    const fileName = file.file_name || "";
    const fileExt = fileName
      .toLowerCase()
      .slice((fileName.lastIndexOf(".") - 1) >>> 0);

    if (
      !allowedExtensions.includes(fileExt) ||
      !allowedFileTypes.includes(file.mime_type)
    ) {
      return ctx.reply(
        "❌ Ushbu fayl formati qabul qilinmaydi!\n" +
          "Qabul qilinadigan formatlar:\n" +
          "• PDF, Word (DOC/DOCX)\n" +
          "• PowerPoint (PPT/PPTX)\n" +
          "• OpenDocument (ODT)\n" +
          "• Tekst (TXT)\n\n" +
          "❌ Excel fayllari qabul qilinmaydi!"
      );
    }

    // Unikal kod yaratish
    const uniqueCode = Math.floor(1000 + Math.random() * 9000).toString();

    // Profil rasmini olish
    let profilePicUrl = null;
    try {
      const photos = await ctx.telegram.getUserProfilePhotos(user.id, 0, 1);
      if (photos.total_count > 0) {
        const photoFile = await ctx.telegram.getFile(
          photos.photos[0][0].file_id
        );
        profilePicUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${photoFile.file_path}`;
      }
    } catch (photoError) {
      console.log("Profil rasmini olishda xatolik:", photoError);
    }

    // Fayl ma'lumotlarini saqlash
    const fileData = {
      fileId: file.file_id,
      fileName: file.file_name || `file_${Date.now()}${fileExt}`,
      fileType: file.mime_type,
      uniqueCode,
      user: {
        username: user.username || "Noma'lum",
        firstName: user.first_name || "Noma'lum",
        lastName: user.last_name || "",
        profilePic: profilePicUrl,
      },
    };

    // Ma'lumotlar bazasiga saqlash
    const savedFile = await File.create(fileData);

    // Foydalanuvchiga javob
    await ctx.reply(
      `✅ Fayl qabul qilindi!\n\n` +
        `📄 Fayl nomi: ${savedFile.fileName}\n` +
        `🔑 Unikal kod: ${savedFile.uniqueCode}\n` +
        `👤 Yuboruvchi: ${
          savedFile.user.username || savedFile.user.firstName
        }\n\n` +
        `⚠️ Ushbu kodni saqlab qo'ying!`
    );

    // Socket.io orqali yangi fayl haqida xabar berish
    io.emit("newFile", fileData);
    usersReadyToSendFiles.delete(ctx.from.id);
  } catch (error) {
    console.error("Fayl qabul qilish xatosi:", error);
    ctx.reply("❌ Faylni qabul qilishda xatolik yuz berdi.");
    usersReadyToSendFiles.delete(ctx.from.id);
  }
});

// Fayl havolasini olish funksiyasi
const getFileLink = async (fileId) => {
  try {
    const file = await bot.telegram.getFile(fileId);
    return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
  } catch (error) {
    console.error("Fayl havolasini olishda xatolik:", error);
    return null;
  }
};

// Web API endpoints
app.get("/files", async (req, res) => {
  try {
    const files = await File.find().sort({ uploadedAt: -1 });
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: "Fayllarni olishda xatolik" });
  }
});

app.get("/files/:code", async (req, res) => {
  try {
    const file = await File.findOne({ uniqueCode: req.params.code });
    if (!file) return res.status(404).json({ error: "Fayl topilmadi" });
    res.json(file);
  } catch (error) {
    res.status(500).json({ error: "Faylni olishda xatolik" });
  }
});

app.delete("/files/:id", async (req, res) => {
  try {
    await File.findByIdAndDelete(req.params.id);
    res.json({ message: "Fayl o'chirildi" });
  } catch (error) {
    res.status(500).json({ error: "Faylni o'chirishda xatolik" });
  }
});

// Serverni ishga tushirish
const PORT = process.env.PORT || 8008;
server.listen(PORT, () => {
  console.log(`Server ${PORT}-portda ishga tushdi`);
  bot
    .launch()
    .then(() => console.log("Bot ishga tushdi"))
    .catch((err) => console.error("Botni ishga tushirishda xatolik:", err));
});

// Xatoliklarni qayd qilish
process.on("unhandledRejection", (error) => {
  console.error("Qayta ishlanmagan rad etish:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Yakunlanmagan istisno:", error);
});
