import { Telegraf, Markup } from "telegraf";
import mongoose from "mongoose";
import { config } from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import axios from "axios";
import cors from "cors";

import ScanFileRouter from "./router/scanFile.routes.js";
import scanFileModel from "./model/scanFile.model.js";

config();

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Database connected"));

const app = express();
app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

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

const allowedFileTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
];

const usersReadyToSendFiles = new Set();

bot.start((ctx) => {
  ctx.reply(
    `Salom, ${ctx.from.first_name || "foydalanuvchi"}!
📂 Fayl yuborish yoki skan faylni olish uchun tugmalardan birini tanlang.`,
    Markup.keyboard([["📤 Fayl yuborish"], ["📋 Scan faylni olish"]])
      .resize()
      .oneTime()
  );
});

bot.hears("📋 Scan faylni olish", (ctx) => {
  ctx.reply("Iltimos, kodni kiriting.");
  bot.on("text", async (ctx) => {
    const code = ctx.message.text.trim();
    try {
      const file = await scanFileModel.findOne({ code });
      if (!file) {
        return ctx.reply("Kechirasiz, ushbu kodga mos fayl topilmadi.");
      }

      await ctx.replyWithDocument(
        { source: file.file },
        {
          caption: `📁 Fayl topildi!
🔑 Kod: ${file.code}
⏳ Yaratilgan sana: ${new Date(file.createdAt).toLocaleString()}`,
        }
      );
    } catch (error) {
      console.error("Xatolik fayl qidirishda:", error);
      ctx.reply("Faylni olishda xatolik yuz berdi.");
    }
  });
});

bot.hears("📤 Fayl yuborish", (ctx) => {
  usersReadyToSendFiles.add(ctx.from.id);
  ctx.reply(
    "Faylingizni yuboring. Faqat quyidagi fayl turlari qabul qilinadi: PDF, DOCX, EXCEL."
  );
});

bot.on("document", async (ctx) => {
  if (!usersReadyToSendFiles.has(ctx.from.id)) {
    return ctx.reply('Avval "📤 Fayl yuborish" tugmasini bosing.');
  }

  try {
    const file = ctx.message.document;
    const user = ctx.message.from;

    if (!allowedFileTypes.includes(file.mime_type)) {
      return ctx.reply(
        "Faqat quyidagi fayl turlari qabul qilinadi: PDF, DOCX, EXCEL."
      );
    }

    const uniqueCode = Math.floor(1000 + Math.random() * 9000).toString();
    const photos = await bot.telegram.getUserProfilePhotos(user.id);
    const userProfilePhoto =
      photos.total_count > 0
        ? await bot.telegram.getFileLink(photos.photos[0][0].file_id)
        : null;

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

    const caption = `✅ Fayl qabul qilindi!\n📄 Fayl nomi: ${
      fileData.fileName
    }\n🔑 Unikal kod: ${uniqueCode}\n👤 Foydalanuvchi: ${
      fileData.user.username || "Noma'lum"
    }\nUshbu kodni saqlab qo'ying.`;
    await ctx.reply(caption);

    io.emit("newFile", fileData);
  } catch (error) {
    console.error("Xatolik:", error);
    ctx.reply("Faylni qabul qilishda xatolik yuz berdi.");
  }
});

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);
  });
});

const getFileLink = async (fileId) => {
  const file = await bot.telegram.getFile(fileId);
  return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
};

app.use("/scan-file", ScanFileRouter);

app.get("/files", async (req, res) => {
  try {
    const files = await File.find();
    const filesWithLinks = await Promise.all(
      files.map(async (file) => {
        const fileLink = await getFileLink(file.fileId);
        return { ...file.toObject(), fileLink };
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
    if (!file) return res.status(404).json({ error: "Fayl topilmadi" });

    const fileLink = await getFileLink(file.fileId);
    const response = await axios.get(fileLink, { responseType: "stream" });

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

// Long polling orqali botni ishga tushirish
bot.launch();

const PORT = process.env.PORT || 8008;
server.listen(PORT, () => console.log(`Server ${PORT}-portda ishlayapti`));
