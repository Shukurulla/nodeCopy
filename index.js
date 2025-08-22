import { Telegraf, Markup } from "telegraf";
import mongoose from "mongoose";
import { config } from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import axios from "axios";
import cors from "cors";
import clickRouter from "./router/click.routes.js";
import paymeRouter from "./router/payme.routes.js"; // Payme router qo'shildi
import ScanFileRouter from "./router/scanFile.routes.js";
import scanFileModel from "./model/scanFile.model.js";
import File from "./model/file.model.js";
import PaidRouter from "./router/paid.routes.js";
import vendingApparatRouter from "./router/vendingApparat.routes.js";
import statistikaRouter from "./router/statistika.routes.js";
import VendingApparat from "./model/vendingApparat.model.js";
import adminRouter from "./router/admin.routes.js";
import paidModel from "./model/paid.model.js";
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

app.set("io", io);

const bot = new Telegraf(process.env.BOT_TOKEN);

const allowedFileTypes = [
  // PDF
  "application/pdf",

  // Word hujjatlari
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx

  // Excel hujjatlari
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx

  // PowerPoint hujjatlari
  "application/vnd.ms-powerpoint", // .ppt
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx

  // Rasm turlari
  "image/png", // .png
  "image/jpeg", // .jpeg va .jpg
];

const usersReadyToSendFiles = new Set();
const usersWaitingForApparatSelection = new Set();
const userSelectedApparats = new Map();
const usersWaitingForScanCode = new Set();

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
    Markup.keyboard([...apparatButtons, ["⬅️ Orqaga"]])
      .resize()
      .oneTime()
  );

  usersWaitingForApparatSelection.add(ctx.from.id);
  usersReadyToSendFiles.delete(ctx.from.id);
  usersWaitingForScanCode.delete(ctx.from.id);
});

bot.hears("📋 Scan faylni olish", (ctx) => {
  ctx.reply(
    "Iltimos, fayl kodini kiriting:",
    Markup.keyboard([["⬅️ Orqaga"]])
      .resize()
      .oneTime()
  );

  usersWaitingForScanCode.add(ctx.from.id);
  usersWaitingForApparatSelection.delete(ctx.from.id);
  usersReadyToSendFiles.delete(ctx.from.id);
});

bot.hears("⬅️ Orqaga", (ctx) => {
  usersWaitingForApparatSelection.delete(ctx.from.id);
  usersReadyToSendFiles.delete(ctx.from.id);
  usersWaitingForScanCode.delete(ctx.from.id);

  ctx.reply(
    `Salom, ${ctx.from.first_name || "foydalanuvchi"}!
📂 Fayl yuborish yoki skan faylni olish uchun tugmalardan birini tanlang.`,
    Markup.keyboard([["📤 Fayl yuborish"], ["📋 Scan faylni olish"]])
      .resize()
      .oneTime()
  );
});

bot.on("text", async (ctx) => {
  if (usersWaitingForScanCode.has(ctx.from.id)) {
    const code = ctx.message.text.trim();

    try {
      const file = await scanFileModel.findOne({ code });
      if (!file) {
        return ctx.reply(
          "Kechirasiz, ushbu kodga mos fayl topilmadi. Kodni qayta tekshiring yoki boshqa kod kiriting.",
          Markup.keyboard([["⬅️ Orqaga"]])
            .resize()
            .oneTime()
        );
      }

      const isPaid = await paidModel.findOne({
        "serviceData._id": file._id,
        status: "paid",
      });
      if (!isPaid) {
        return ctx.reply(
          "Ushbu xizmat uchun haq to'lanmagan",
          Markup.keyboard([["⬅️ Orqaga"]])
            .resize()
            .oneTime()
        );
      }

      await ctx.replyWithDocument(
        { source: file.file },
        {
          caption: `📁 Fayl topildi!
🔑 Kod: ${file.code}
⏳ Yaratilgan sana: ${new Date(file.createdAt).toLocaleString()}`,
        }
      );

      usersWaitingForScanCode.delete(ctx.from.id);

      ctx.reply(
        "Fayl muvaffaqiyatli yuborildi! Yana biror narsa kerakmi?",
        Markup.keyboard([["📤 Fayl yuborish"], ["📋 Scan faylni olish"]])
          .resize()
          .oneTime()
      );
    } catch (error) {
      console.error("Xatolik fayl qidirishda:", error);
      ctx.reply(
        "Faylni olishda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.",
        Markup.keyboard([["⬅️ Orqaga"]])
          .resize()
          .oneTime()
      );
    }
    return;
  }

  if (usersWaitingForApparatSelection.has(ctx.from.id)) {
    const messageText = ctx.message.text;
    const apparatIdMatch = messageText.match(/- ([^\s]+)$/);

    if (apparatIdMatch && apparatIdMatch[1]) {
      const apparatId = apparatIdMatch[1];
      const apparat = await VendingApparat.findOne({ apparatId });

      if (apparat) {
        userSelectedApparats.set(ctx.from.id, apparatId);
        usersWaitingForApparatSelection.delete(ctx.from.id);
        usersReadyToSendFiles.add(ctx.from.id);

        ctx.reply(
          `Siz "${apparat.nomi}" apparatini tanladingiz. Endi faylingizni yuklang.
Qabul qilinadigan fayl turlari:
✅ Hujjatlar: PDF, DOC, DOCX
✅ Jadval fayllari: XLS, XLSX
✅ Taqdimotlar: PPT, PPTX
✅ Rasmlar: PNG, JPEG, JPG
        `
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
    const fileUrl = await getFileLink(file.file_id);

    // Calculate file size in KB and format it
    const fileSizeBytes = file.file_size; // Size in bytes
    const fileSizeKB = fileSizeBytes / 1024; // Convert to KB
    const fileSizeFormatted =
      fileSizeKB >= 1024
        ? `${(fileSizeKB / 1024).toFixed(2)} MB`
        : `${fileSizeKB.toFixed(2)} KB`;

    let userProfilePhoto =
      "https://static.vecteezy.com/system/resources/previews/021/548/095/non_2x/default-profile-picture-avatar-user-avatar-icon-person-icon-head-icon-profile-picture-icons-default-anonymous-user-male-and-female-businessman-photo-placeholder-social-network-avatar-portrait-free-vector.jpg";

    try {
      const photos = await ctx.telegram.getUserProfilePhotos(user.id, 0, 1);
      if (photos.total_count > 0) {
        const photoFile = photos.photos[0][0];
        const fileInfo = await ctx.telegram.getFile(photoFile.file_id);
        userProfilePhoto = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;

        try {
          await axios.head(userProfilePhoto);
        } catch (error) {
          console.log("Profil rasmi havolasi ishlamayapti:", error);
          userProfilePhoto =
            "https://static.vecteezy.com/system/resources/previews/021/548/095/non_2x/default-profile-picture-avatar-user-avatar-icon-person-icon-head-icon-profile-picture-icons-default-anonymous-user-male-and-female-businessman-photo-placeholder-social-network-avatar-portrait-free-vector.jpg";
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
      apparatId,
      fileUrl,
      fileSize: fileSizeFormatted, // Use formatted file size
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
    }\n📏 Fayl hajmi: ${
      fileData.fileSize
    }\n🔑 Unikal kod: ${uniqueCode}\n👤 Foydalanuvchi: ${
      fileData.user.username || "Noma'lum"
    }\n🏢 Vending apparat: ${apparatId}\nUshbu kodni saqlab qo'ying.`;
    await ctx.reply(caption);

    io.to(apparatId).emit("newFile", {
      ...fileData,
      fileLink: fileUrl,
    });

    io.emit("apparatNewFile", {
      apparatId,
      file: {
        ...fileData,
        fileLink: fileUrl,
      },
    });

    usersReadyToSendFiles.delete(ctx.from.id);
    userSelectedApparats.delete(ctx.from.id);
  } catch (error) {
    console.error("Xatolik:", error);
    ctx.reply("Faylni qabul qilishda xatolik yuz berdi.");
  }
});

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.on("apparatUlanish", (apparatId) => {
    console.log(`Apparat ulandi: ${apparatId}`);
    socket.apparatId = apparatId;
    socket.join(apparatId);

    File.find({ apparatId })
      .sort({ uploadedAt: -1 })
      .then(async (files) => {
        const filesWithLinks = files.map((file) => {
          return {
            ...file.toObject(),
            fileLink: file.fileUrl,
          };
        });
        socket.emit("allFiles", filesWithLinks);
      })
      .catch((error) => {
        console.error("Fayllarni yuklashda xatolik:", error);
      });
  });

  socket.on("tolovTasdiqlandi", async (data) => {
    const { fileId, apparatId, amount, qogozSoni } = data;

    try {
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

      const apparat = await VendingApparat.findOne({ apparatId });
      if (apparat) {
        apparat.joriyQogozSoni -= qogozSoni || 0;
        await apparat.save();

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

  socket.on("qrTolovHolati", ({ apparatId, fileId, status }) => {
    io.to(apparatId).emit("qrTolovYangilandi", { fileId, status });
  });

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
app.use("/api/payme", paymeRouter); // Eski endpoint
app.use("/api/v1/payme", paymeRouter);
app.use("/api/paid", PaidRouter);
app.use("/api/vending-apparat", vendingApparatRouter);
app.use("/api/statistika", statistikaRouter);

app.get("/files", async (req, res) => {
  try {
    const { apparatId } = req.query;

    if (!apparatId) {
      return res.status(400).json({ xato: "ApparatId ko'rsatilmagan" });
    }

    const files = await File.find({ apparatId }).sort({ uploadedAt: -1 });
    const filesWithLinks = files.map((file) => {
      return {
        ...file.toObject(),
        fileLink: file.fileUrl,
      };
    });
    res.json(filesWithLinks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Fayllarni olishda xatolik yuz berdi." });
  }
});

app.get("/admin/files", async (req, res) => {
  try {
    const files = await File.find().sort({ uploadedAt: -1 });
    const filesWithLinks = files.map((file) => {
      return {
        ...file.toObject(),
        fileLink: file.fileUrl,
      };
    });
    res.json({ muvaffaqiyat: true, malumot: filesWithLinks });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      muvaffaqiyat: false,
      xabar: "Fayllarni olishda xatolik yuz berdi.",
    });
  }
});

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

    const fileLink = file.fileUrl;
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

bot.launch({
  polling: true,
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

const PORT = process.env.PORT || 8008;
server.listen(PORT, () => console.log(`Server ${PORT}-portda ishlayapti`));
