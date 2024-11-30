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
const bot = new Telegraf("7361090236:AAFgtyAOaZvJZOx5f6z-X8UrMBAzv7PsacA"); // O'zingizning bot tokeningizni kiriting

// === Fayl yuborish tugmasi ===
// === Fayl yuborish tugmasi ===
bot.start((ctx) => {
  ctx.reply(
    "Salom! Fayl yuborish uchun tugmani bosing yoki faylni bevosita botga yuboring.",
    {
      reply_markup: {
        keyboard: [
          [{ text: "📂 Fayl yuborish", request_poll: false }], // Fayl yuborish tugmasi
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
});

// === Fayl yuborish tugmachasiga javob ===
bot.hears("📂 Fayl yuborish", (ctx) => {
  ctx.reply(
    "Iltimos, fayl yuboring. Faqat 'document' fayl turini qabul qilamiz!"
  );
});

// === 4 xonali unikal kod yaratish funksiyasi ===
function generateUniqueCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// === Faqat fayl qabul qilish ===
// === Faqat fayl qabul qilish ===
bot.on(["document", "photo", "video", "audio", "sticker"], async (ctx) => {
  try {
    const file = ctx.message.document || ctx.message.photo?.pop();
    const fileType = ctx.message.document ? "document" : "photo";

    // Fayl turini tekshirish
    if (!ctx.message.document) {
      return ctx.reply(
        "Faqat 'document' (hujjat) turidagi fayllarni yuborishingiz mumkin. Video, musiqa, yoki boshqa fayl turlari printerda chiqarib bo'lmaydi."
      );
    }

    // 4 xonali unikal kod yaratish
    const uniqueCode = generateUniqueCode();

    // Faylni yuklash va saqlash
    const fileData = {
      fileId: file.file_id,
      fileName: file.file_name || `document_${Date.now()}`,
      fileType,
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
  // Bu yerda apparatning API funksiyasini chaqirishingiz kerak.
  // Masalan, faylni o'qing va boshqa joyga yuboring.
  console.log(`Fayl apparatga yuborilmoqda:`, fileData);

  // Bu bo'limda real API chaqiruv yoziladi.
  // Masalan:
  // axios.post('http://printer-api/print', fileData);
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
  res.json({ msg: "Helle" });
});

app.listen(3001, () => {
  console.log("server 3001 portda ishga tushdi");
});

console.log("Bot ishga tushdi!");
