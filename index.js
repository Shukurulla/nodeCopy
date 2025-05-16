import { Telegraf, Markup } from "telegraf";
import mongoose from "mongoose";
import { config } from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import axios from "axios";
import cors from "cors";
import clickRouter from "./router/click.routes.js";
import ScanFileRouter from "./router/scanFile.routes.js";
import scanFileModel from "./model/scanFile.model.js";
import File from "./model/file.model.js";
import PaidRouter from "./router/paid.routes.js";
import vendingApparatRouter from "./router/vendingApparat.routes.js"; // Yangi qo'shildi
import statistikaRouter from "./router/statistika.routes.js"; // Yangi qo'shildi
import VendingApparat from "./model/vendingApparat.model.js"; // Yangi qo'shildi
import adminRouter from "./router/admin.routes.js";
config();

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Database connected");
  });

const app = express();
app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Socket.io ni app o'zgaruvchisiga qo'shish
app.set("io", io);

const bot = new Telegraf(process.env.BOT_TOKEN);

const allowedFileTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
];

const usersReadyToSendFiles = new Set();
const usersWaitingForApparatSelection = new Set(); // Yangi qo'shildi
const userSelectedApparats = new Map(); // Yangi qo'shildi: foydalanuvchi -> apparatId
const usersWaitingForScanCode = new Set(); // Scan code uchun

// Apparatlarni tanlash uchun tugmalarni yaratish
const getApparatButtons = async () => {
  const apparatlar = await VendingApparat.find({ holati: "faol" });
  return apparatlar.map((apparat) => [
    apparat.nomi + " - " + apparat.apparatId,
  ]);
};

bot.start((ctx) => {
  ctx.reply(
    `Salom, ${ctx.from.first_name || "foydalanuvchi"}!
📂 Fayl yuborish yoki skan faylni olish uchun tugmalardan birini tanlang.`,
    Markup.keyboard([["📤 Fayl yuborish"], ["📋 Scan faylni olish"]])
      .resize()
      .oneTime()
  );
});
bot.hears("📤 Fayl yuborish", async (ctx) => {
  const apparatButtons = await getApparatButtons();

  if (apparatButtons.length === 0) {
    return ctx.reply(
      "Kechirasiz, hozirda faol vending apparatlar mavjud emas."
    );
  }

  ctx.reply(
    "Iltimos, fayl yuborish uchun vending apparatni tanlang:",
    Markup.keyboard([
      ...apparatButtons,
      ["⬅️ Orqaga"], // Orqaga qaytish tugmasi
    ])
      .resize()
      .oneTime()
  );

  // Foydalanuvchini apparatlari tanlash kutayotganlar ro'yxatiga qo'shish
  usersWaitingForApparatSelection.add(ctx.from.id);
  usersReadyToSendFiles.delete(ctx.from.id);
});

bot.hears("⬅️ Orqaga", (ctx) => {
  // Barcha holatlarni tozalash
  usersWaitingForApparatSelection.delete(ctx.from.id);
  usersReadyToSendFiles.delete(ctx.from.id);
  usersWaitingForScanCode.delete(ctx.from.id);

  // Bosh menyuni ko'rsatish
  ctx.reply(
    `Salom, ${ctx.from.first_name || "foydalanuvchi"}!
📂 Fayl yuborish yoki skan faylni olish uchun tugmalardan birini tanlang.`,
    Markup.keyboard([["📤 Fayl yuborish"], ["📋 Scan faylni olish"]])
      .resize()
      .oneTime()
  );
});

bot.on("text", async (ctx) => {
  // Scan fayl kodi kiritilganmi tekshirish
  if (usersWaitingForScanCode.has(ctx.from.id)) {
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

      // Foydalanuvchini kutish ro'yxatidan o'chirish
      usersWaitingForScanCode.delete(ctx.from.id);
    } catch (error) {
      console.error("Xatolik fayl qidirishda:", error);
      ctx.reply("Faylni olishda xatolik yuz berdi.");
    }
    return;
  }

  // Apparatni tanlash
  if (usersWaitingForApparatSelection.has(ctx.from.id)) {
    const messageText = ctx.message.text;
    // apparatId ni ajratib olish
    const apparatIdMatch = messageText.match(/- ([^\s]+)$/);

    if (apparatIdMatch && apparatIdMatch[1]) {
      const apparatId = apparatIdMatch[1];
      // Apparat mavjudligini tekshirish
      const apparat = await VendingApparat.findOne({ apparatId });

      if (apparat) {
        userSelectedApparats.set(ctx.from.id, apparatId);
        usersWaitingForApparatSelection.delete(ctx.from.id);
        usersReadyToSendFiles.add(ctx.from.id);

        ctx.reply(
          `Siz "${apparat.nomi}" apparatini tanladingiz. Endi faylingizni yuboring. Faqat quyidagi fayl turlari qabul qilinadi: PDF, DOCX, EXCEL.`
        );
      } else {
        ctx.reply(
          "Kechirasiz, bunday apparat topilmadi. Iltimos, ro'yxatdan tanlang."
        );
      }
    } else {
      ctx.reply("Noto'g'ri format. Iltimos, ro'yxatdan apparatni tanlang.");
    }
    return;
  }

  // Boshqa tekst xabarlar uchun
  ctx.reply(
    "Fayl yuborish yoki skan faylni olish uchun tugmalardan birini tanlang.",
    Markup.keyboard([["📤 Fayl yuborish"], ["📋 Scan faylni olish"]])
      .resize()
      .oneTime()
  );
});

bot.on("document", async (ctx) => {
  if (!usersReadyToSendFiles.has(ctx.from.id)) {
    return ctx.reply('Avval "📤 Fayl yuborish" tugmasini bosing.');
  }

  try {
    const file = ctx.message.document;
    const user = ctx.message.from;
    const apparatId = userSelectedApparats.get(ctx.from.id);

    if (!apparatId) {
      return ctx.reply("Iltimos, avval vending apparatni tanlang.");
    }

    if (!allowedFileTypes.includes(file.mime_type)) {
      return ctx.reply(
        "Faqat quyidagi fayl turlari qabul qilinadi: PDF, DOCX, EXCEL."
      );
    }

    const uniqueCode = Math.floor(1000 + Math.random() * 9000).toString();
    let userProfilePhoto = null;

    try {
      // Profil rasmini olish
      const photos = await ctx.telegram.getUserProfilePhotos(user.id, 0, 1);
      if (photos.total_count > 0) {
        const photoFile = photos.photos[0][0];
        const fileInfo = await ctx.telegram.getFile(photoFile.file_id);
        userProfilePhoto = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;

        // Havolani tekshirish
        try {
          await axios.head(userProfilePhoto);
        } catch (error) {
          console.log("Profil rasmi havolasi ishlamayapti:", error);
          userProfilePhoto = null;
        }
      }
    } catch (error) {
      console.log("Profil rasmini olishda xatolik:", error);
    }

    const fileData = {
      fileId: file.file_id,
      fileName: file.file_name || `file_${Date.now()}`,
      fileType: file.mime_type,
      uniqueCode,
      apparatId, // Yangi maydon qo'shildi
      user: {
        username: user.username || "Noma'lum",
        firstName: user.first_name || "Noma'lum",
        lastName: user.last_name || "",
        profilePic: userProfilePhoto,
      },
    };

    const savedFile = new File(fileData);
    await savedFile.save();
    const fileLink = await getFileLink(file.file_id);

    const caption = `✅ Fayl qabul qilindi!\n📄 Fayl nomi: ${
      fileData.fileName
    }\n🔑 Unikal kod: ${uniqueCode}\n👤 Foydalanuvchi: ${
      fileData.user.username || "Noma'lum"
    }\n🏢 Vending apparat: ${apparatId}\nUshbu kodni saqlab qo'ying.`;
    await ctx.reply(caption);

    // Faqat tanlangan apparatga fayl yuborish
    io.to(apparatId).emit("newFile", {
      ...fileData,
      fileLink,
    });

    // Barcha apparat turlariga fayl yuborilishini oldini olish
    io.emit("apparatNewFile", {
      apparatId,
      file: {
        ...fileData,
        fileLink,
      },
    });

    // Foydalanuvchini qayta tayyorlash uchun
    usersReadyToSendFiles.delete(ctx.from.id);
    userSelectedApparats.delete(ctx.from.id);
  } catch (error) {
    console.error("Xatolik:", error);
    ctx.reply("Faylni qabul qilishda xatolik yuz berdi.");
  }
});

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  // Apparat identifikatorini saqlash
  socket.on("apparatUlanish", (apparatId) => {
    console.log(`Apparat ulandi: ${apparatId}`);
    socket.apparatId = apparatId;
    socket.join(apparatId); // xona yaratish

    // Apparatga tegishli barcha fayllarnі yuborish
    File.find({ apparatId })
      .sort({ uploadedAt: -1 })
      .then(async (files) => {
        const filesWithLinks = await Promise.all(
          files.map(async (file) => {
            const fileLink = await getFileLink(file.fileId);
            return { ...file.toObject(), fileLink };
          })
        );
        socket.emit("allFiles", filesWithLinks);
      })
      .catch((error) => {
        console.error("Fayllarni yuklashda xatolik:", error);
      });
  });

  // Apparat tomonidan to'lov tasdiqlanganda
  socket.on("tolovTasdiqlandi", async (data) => {
    const { fileId, apparatId, amount, qogozSoni } = data;

    try {
      // Statistikani yangilash
      const bugun = new Date();
      bugun.setHours(0, 0, 0, 0);

      let statistika = await Statistika.findOne({
        apparatId,
        sana: {
          $gte: bugun,
        },
      });

      if (!statistika) {
        statistika = new Statistika({
          apparatId,
          sana: bugun,
          foydalanishSoni: 1,
          daromad: amount || 0,
          ishlatilganQogoz: qogozSoni || 0,
        });
      } else {
        statistika.foydalanishSoni += 1;
        statistika.daromad += amount || 0;
        statistika.ishlatilganQogoz += qogozSoni || 0;
      }

      await statistika.save();

      // Apparat qog'oz sonini yangilash
      const apparat = await VendingApparat.findOne({ apparatId });
      if (apparat) {
        apparat.joriyQogozSoni -= qogozSoni || 0;
        await apparat.save();

        // Qog'oz kam qolganda xabar berish
        if (apparat.joriyQogozSoni <= apparat.kamQogozChegarasi) {
          io.emit("qogozKam", {
            apparatId,
            joriyQogozSoni: apparat.joriyQogozSoni,
            xabar: `Diqqat! ${apparat.nomi} apparatida qog'oz kam qoldi: ${apparat.joriyQogozSoni} ta`,
          });
        }
      }
    } catch (error) {
      console.error("Statistikani yangilashda xatolik:", error);
    }
  });

  // QR kod orqali to'lov holati o'zgarganda
  socket.on("qrTolovHolati", ({ apparatId, fileId, status }) => {
    io.to(apparatId).emit("qrTolovYangilandi", { fileId, status });
  });

  // Admin paneldan qog'oz sonini yangilanganda
  socket.on("qogozSoniYangilandi", ({ apparatId, soni }) => {
    io.to(apparatId).emit("qogozSoniYangilandi", { apparatId, soni });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);
  });
});

const getFileLink = async (fileId) => {
  const file = await bot.telegram.getFile(fileId);
  return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
};

app.use("/api/admin", adminRouter);

app.use("/scan-file", ScanFileRouter);
app.use("/api/click", clickRouter);
app.use("/api/paid", PaidRouter);
app.use("/api/vending-apparat", vendingApparatRouter); // Yangi qo'shildi
app.use("/api/statistika", statistikaRouter); // Yangi qo'shildi

// Fayllarni faqat kerakli apparatga yuborish
app.get("/files", async (req, res) => {
  try {
    const { apparatId } = req.query;

    if (!apparatId) {
      return res.status(400).json({ xato: "ApparatId ko'rsatilmagan" });
    }

    const files = await File.find({ apparatId }).sort({ uploadedAt: -1 });
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

// Barcha fayllarni ko'rish (admin uchun)
app.get("/admin/files", async (req, res) => {
  try {
    const files = await File.find().sort({ uploadedAt: -1 });
    const filesWithLinks = await Promise.all(
      files.map(async (file) => {
        const fileLink = await getFileLink(file.fileId);
        return { ...file.toObject(), fileLink };
      })
    );
    res.json({ muvaffaqiyat: true, malumot: filesWithLinks });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      muvaffaqiyat: false,
      xabar: "Fayllarni olishda xatolik yuz berdi.",
    });
  }
});

// Barcha fayllarni o'chirish
app.delete("/files/all-delete", async (req, res) => {
  try {
    const findFiles = await File.find();
    for (let i = 0; i < findFiles.length; i++) {
      await File.findByIdAndDelete(findFiles[i]._id);
    }
    res.json({ message: "Clear" });
  } catch (error) {
    res.json({ message: error.message });
  }
});

// Apparatga tegishli fayllarni o'chirish
app.delete("/files/apparat/:apparatId", async (req, res) => {
  try {
    const { apparatId } = req.params;
    await File.deleteMany({ apparatId });
    res.json({ muvaffaqiyat: true, xabar: "Fayllar o'chirildi" });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
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

app.get("/", (req, res) => {
  res.send("Flash Print ishlayapti!");
});

// Long polling orqali botni ishga tushirish
bot.launch({
  polling: true,
});

// Jarayonni to'xtatishda botni to'xtatish
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

const PORT = process.env.PORT || 8008;
server.listen(PORT, () => console.log(`Server ${PORT}-portda ishlayapti`));
