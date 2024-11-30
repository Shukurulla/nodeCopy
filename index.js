import { Telegraf } from "telegraf";
import mongoose from "mongoose";
import { config } from "dotenv";
import express from "express";
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

const fileSchema = new mongoose.Schema({
  fileId: String,
  fileName: String,
  fileType: String,
  uniqueCode: String,
  uploadedAt: { type: Date, default: Date.now },
});

const File = mongoose.model("File", fileSchema);

// === Telegram Botni sozlash ===
const bot = new Telegraf(process.env.BOT_TOKEN); // O'zingizning bot tokeningizni `.env` faylida saqlang

// === Fayl yuborish tugmasi ===
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
    // Fayl ma'lumotlarini olish
    const file = ctx.message.document;

    // Fayl turini tekshirish
    if (!allowedFileTypes.includes(file.mime_type)) {
      return ctx.reply(
        "Faqat quyidagi fayl turlari qabul qilinadi: PDF, DOCX, EXCEL."
      );
    }

    // 4 xonali unikal kod yaratish
    const uniqueCode = generateUniqueCode();

    // Faylni yuklash va saqlash
    const fileData = {
      fileId: file.file_id,
      fileName: file.file_name || `file_${Date.now()}`,
      fileType: file.mime_type,
      uniqueCode,
    };

    // MongoDB-ga saqlash
    const savedFile = new File(fileData);
    await savedFile.save();

    // Foydalanuvchiga unikal kod yuborish va faylni qayta jo'natish
    await ctx.reply(
      `Fayl qabul qilindi! Unikal kod: ${uniqueCode}. Ushbu kodni nusxa chiqarishda kiriting.`
    );
    await ctx.telegram.sendDocument(ctx.chat.id, file.file_id);

    // Faylni apparatga yuborish (API chaqiruv)
    sendFileToPrinter(fileData);
  } catch (error) {
    console.error(error);
    ctx.reply("Faylni qabul qilishda xatolik yuz berdi.");
  }
});

// === Apparatga faylni yuborish ===
function sendFileToPrinter(fileData) {
  console.log(`Fayl apparatga yuborilmoqda:`, fileData);
  // Bu bo'limda real API chaqiruv yoziladi.
}

// === Nusxa chiqarishni tasdiqlash ===
bot.command("print", async (ctx) => {
  try {
    const { text } = ctx.message;
    const uniqueCode = text.split(" ")[1];

    if (!uniqueCode) {
      return ctx.reply(
        "Nusxa chiqarish uchun unikal kodni kiriting: /print YOUR_CODE"
      );
    }

    const file = await File.findOne({ uniqueCode });

    if (!file) {
      return ctx.reply("Bunday unikal kodga ega fayl topilmadi.");
    }

    ctx.reply(`Fayl nusxa chiqarilmoqda: ${file.fileName}`);

    // Faylni apparatga yuborish uchun API chaqiruvini qo'shing.
    // sendFileToPrinter(file);

    // Faylni nusxa chiqarish yakunlangach o'chirish
    await File.deleteOne({ uniqueCode });
    ctx.reply("Fayl muvaffaqiyatli o'chirildi!");
  } catch (error) {
    console.error(error);
    ctx.reply("Nusxa chiqarish vaqtida xatolik yuz berdi.");
  }
});

// === Botni ishga tushirish ===
bot.launch();

app.get("/", async (req, res) => {
  res.json({ msg: "Hello" });
});

const nodeBot = "https://nodecopy.onrender.com/";
// Ping qilish funksiyasi
const pingRenderServer = async () => {
  try {
    const res = await fetch(nodeBot);
    console.log("Render Node serverga ping jo'natildi:", res.status);
  } catch (error) {
    console.error("Pingda xatolik yuz berdi:", error);
  }
};

// Har 1 daqiqada ping qilish
setInterval(pingRenderServer, 60000);

app.listen(3001, () => {
  console.log("server 3001 portda ishga tushdi");
});

console.log("Bot ishga tushdi!");
