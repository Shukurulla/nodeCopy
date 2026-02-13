import { Telegraf, Markup } from "telegraf";
import mongoose from "mongoose";
import { config } from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import axios from "axios";
import cors from "cors";
import QRCode from "qrcode";
import clickRouter from "./router/click.routes.js";
import paymeRouter from "./router/payme.routes.js";
import ScanFileRouter from "./router/scanFile.routes.js";
import copyRouter from "./router/copy.routes.js";
import scanFileModel from "./model/scanFile.model.js";
import File from "./model/file.model.js";
import PaidRouter from "./router/paid.routes.js";
import vendingApparatRouter from "./router/vendingApparat.routes.js";
import statistikaRouter from "./router/statistika.routes.js";
import VendingApparat from "./model/vendingApparat.model.js";
import Statistika from "./model/statistika.model.js";
import UserSession from "./model/userSession.model.js";
import adminRouter from "./router/admin.routes.js";
import settingsRouter from "./router/settings.routes.js";
import paidModel from "./model/paid.model.js";
config();

// ============ DATABASE ============
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Database connected");
  });

// ============ EXPRESS + SOCKET.IO ============
const app = express();
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);
app.options("*", cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.set("io", io);

// ============ TELEGRAM BOT ============
const bot = new Telegraf(process.env.BOT_TOKEN);

let botUsername = "";
bot.telegram.getMe().then((me) => {
  botUsername = me.username;
  console.log(`Bot username: @${botUsername}`);
});

const allowedFileTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
];

const fileTypeLabels = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "PPTX",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
};

// In-memory state (faqat scan code kutish uchun)
const usersWaitingForScanCode = new Set();

// ---- Yordamchi funksiyalar ----

const getFileLink = async (fileId) => {
  const file = await bot.telegram.getFile(fileId);
  return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
};

const getUserSession = async (telegramId) => {
  return UserSession.findOne({ telegramId });
};

const setUserSession = async (telegramId, apparatId, firstName, username) => {
  return UserSession.findOneAndUpdate(
    { telegramId },
    { apparatId, firstName, username },
    { upsert: true, new: true }
  );
};

const getApparatInfo = async (apparatId) => {
  return VendingApparat.findOne({ apparatId });
};

const formatFileSize = (bytes) => {
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(2)} KB`;
};

const getUserProfilePhoto = async (ctx, userId) => {
  const defaultPhoto =
    "https://static.vecteezy.com/system/resources/previews/021/548/095/non_2x/default-profile-picture-avatar-user-avatar-icon-person-icon-head-icon-profile-picture-icons-default-anonymous-user-male-and-female-businessman-photo-placeholder-social-network-avatar-portrait-free-vector.jpg";
  try {
    const photos = await ctx.telegram.getUserProfilePhotos(userId, 0, 1);
    if (photos.total_count > 0) {
      const photoFile = photos.photos[0][0];
      const fileInfo = await ctx.telegram.getFile(photoFile.file_id);
      const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;
      await axios.head(url);
      return url;
    }
  } catch (e) {
    // Profil rasmi mavjud emas yoki xatolik
  }
  return defaultPhoto;
};

// ---- Asosiy menyu ----

const sendMainMenu = async (ctx, session) => {
  if (session) {
    const apparat = await getApparatInfo(session.apparatId);
    const apparatName = apparat ? apparat.nomi : session.apparatId;
    const apparatStatus = apparat
      ? apparat.holati === "faol"
        ? "Faol"
        : "Nofaol"
      : "Noma'lum";

    await ctx.reply(
      `Xush kelibsiz, ${ctx.from.first_name || "foydalanuvchi"}!\n\n` +
        `Ulangan apparat: ${apparatName}\n` +
        `Holati: ${apparatStatus}\n\n` +
        `Quyidagi amallardan birini tanlang:`,
      Markup.inlineKeyboard([
        [Markup.button.callback("📤 Fayl yuborish", "action_send_file")],
        [Markup.button.callback("📋 Scan faylni olish", "action_get_scan")],
        [
          Markup.button.callback(
            "🔄 Apparatni almashtirish",
            "action_change_apparat"
          ),
        ],
      ])
    );
  } else {
    await ctx.reply(
      `Salom, ${ctx.from.first_name || "foydalanuvchi"}!\n\n` +
        `Flash Print botiga xush kelibsiz.\n\n` +
        `Boshlash uchun vending apparatdagi QR kodni skanerlang yoki quyidagi ro'yxatdan apparatni tanlang.`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🖨 Apparatni tanlash",
            "action_select_apparat"
          ),
        ],
      ])
    );
  }
};

// ---- /start handler (deeplink bilan) ----

bot.start(async (ctx) => {
  usersWaitingForScanCode.delete(ctx.from.id);

  const payload = ctx.startPayload; // QR dan kelgan apparatId

  if (payload) {
    // QR code skanerlangan — apparatni topamiz
    const apparat = await getApparatInfo(payload);

    if (!apparat) {
      return ctx.reply(
        "Kechirasiz, bu apparat topilmadi. QR kodni qaytadan skanerlang.",
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "🖨 Apparatni tanlash",
              "action_select_apparat"
            ),
          ],
        ])
      );
    }

    if (apparat.holati !== "faol") {
      return ctx.reply(
        `"${apparat.nomi}" apparati hozirda ishlamayapti.\n\nIltimos, boshqa apparatni tanlang.`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "🖨 Boshqa apparat tanlash",
              "action_select_apparat"
            ),
          ],
        ])
      );
    }

    // Sessiyani MongoDB ga saqlaymiz
    await setUserSession(
      ctx.from.id,
      apparat.apparatId,
      ctx.from.first_name,
      ctx.from.username
    );

    await ctx.reply(
      `Apparat ulandi!\n\n` +
        `🖨 ${apparat.nomi}\n` +
        `📍 ${apparat.manzil || "Manzil ko'rsatilmagan"}\n\n` +
        `Endi quyidagi amallardan birini tanlang:`,
      Markup.inlineKeyboard([
        [Markup.button.callback("📤 Fayl yuborish", "action_send_file")],
        [Markup.button.callback("📋 Scan faylni olish", "action_get_scan")],
      ])
    );
  } else {
    // Oddiy /start — sessiya bormi tekshiramiz
    const session = await getUserSession(ctx.from.id);
    await sendMainMenu(ctx, session);
  }
});

// ---- Inline button actionlar ----

bot.action("action_send_file", async (ctx) => {
  await ctx.answerCbQuery();
  usersWaitingForScanCode.delete(ctx.from.id);

  const session = await getUserSession(ctx.from.id);

  if (!session) {
    return ctx.editMessageText(
      "Avval apparatni tanlang. QR kodni skanerlang yoki ro'yxatdan tanlang.",
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🖨 Apparatni tanlash",
            "action_select_apparat"
          ),
        ],
      ])
    );
  }

  const apparat = await getApparatInfo(session.apparatId);
  if (!apparat || apparat.holati !== "faol") {
    return ctx.editMessageText(
      "Tanlangan apparat hozirda ishlamayapti. Boshqa apparatni tanlang.",
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🖨 Apparatni tanlash",
            "action_select_apparat"
          ),
        ],
      ])
    );
  }

  await ctx.editMessageText(
    `📤 Fayl yuborish\n\n` +
      `Apparat: ${apparat.nomi}\n\n` +
      `Faylingizni shu chatga yuboring.\n\n` +
      `Qabul qilinadigan formatlar:\n` +
      `  PDF, DOC, DOCX, XLS, XLSX,\n` +
      `  PPT, PPTX, PNG, JPEG`,
    Markup.inlineKeyboard([
      [Markup.button.callback("⬅️ Orqaga", "action_back_menu")],
    ])
  );
});

bot.action("action_get_scan", async (ctx) => {
  await ctx.answerCbQuery();

  usersWaitingForScanCode.add(ctx.from.id);

  await ctx.editMessageText(
    `📋 Scan faylni olish\n\nIltimos, fayl kodini yozing:`,
    Markup.inlineKeyboard([
      [Markup.button.callback("⬅️ Orqaga", "action_back_menu")],
    ])
  );
});

bot.action("action_change_apparat", async (ctx) => {
  await ctx.answerCbQuery();
  usersWaitingForScanCode.delete(ctx.from.id);

  await ctx.editMessageText(
    `🔄 Apparatni almashtirish\n\nVending apparatdagi QR kodni skanerlang yoki ro'yxatdan tanlang.`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "🖨 Ro'yxatdan tanlash",
          "action_select_apparat"
        ),
      ],
      [Markup.button.callback("⬅️ Orqaga", "action_back_menu")],
    ])
  );
});

bot.action("action_select_apparat", async (ctx) => {
  await ctx.answerCbQuery();
  usersWaitingForScanCode.delete(ctx.from.id);

  const apparatlar = await VendingApparat.find({ holati: "faol" });

  if (apparatlar.length === 0) {
    return ctx.editMessageText(
      "Hozirda faol apparatlar mavjud emas.",
      Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Orqaga", "action_back_menu")],
      ])
    );
  }

  const buttons = apparatlar.map((a) => [
    Markup.button.callback(
      `🖨 ${a.nomi}${a.manzil ? " — " + a.manzil : ""}`,
      `select_apparat_${a.apparatId}`
    ),
  ]);

  buttons.push([Markup.button.callback("⬅️ Orqaga", "action_back_menu")]);

  await ctx.editMessageText(
    "Apparatni tanlang:",
    Markup.inlineKeyboard(buttons)
  );
});

// Apparat tanlash callback
bot.action(/^select_apparat_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const apparatId = ctx.match[1];
  const apparat = await getApparatInfo(apparatId);

  if (!apparat) {
    return ctx.editMessageText("Apparat topilmadi.", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Orqaga", callback_data: "action_back_menu" }],
        ],
      },
    });
  }

  await setUserSession(
    ctx.from.id,
    apparat.apparatId,
    ctx.from.first_name,
    ctx.from.username
  );

  await ctx.editMessageText(
    `Apparat ulandi!\n\n` +
      `🖨 ${apparat.nomi}\n` +
      `📍 ${apparat.manzil || "Manzil ko'rsatilmagan"}\n\n` +
      `Quyidagi amallardan birini tanlang:`,
    Markup.inlineKeyboard([
      [Markup.button.callback("📤 Fayl yuborish", "action_send_file")],
      [Markup.button.callback("📋 Scan faylni olish", "action_get_scan")],
    ])
  );
});

bot.action("action_back_menu", async (ctx) => {
  await ctx.answerCbQuery();
  usersWaitingForScanCode.delete(ctx.from.id);

  const session = await getUserSession(ctx.from.id);

  if (session) {
    const apparat = await getApparatInfo(session.apparatId);
    const apparatName = apparat ? apparat.nomi : session.apparatId;

    await ctx.editMessageText(
      `Ulangan apparat: ${apparatName}\n\nQuyidagi amallardan birini tanlang:`,
      Markup.inlineKeyboard([
        [Markup.button.callback("📤 Fayl yuborish", "action_send_file")],
        [Markup.button.callback("📋 Scan faylni olish", "action_get_scan")],
        [
          Markup.button.callback(
            "🔄 Apparatni almashtirish",
            "action_change_apparat"
          ),
        ],
      ])
    );
  } else {
    await ctx.editMessageText(
      `Flash Print botiga xush kelibsiz.\n\nQR kodni skanerlang yoki apparatni tanlang.`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🖨 Apparatni tanlash",
            "action_select_apparat"
          ),
        ],
      ])
    );
  }
});

// ---- Matn xabarlari (scan code) ----

bot.on("text", async (ctx) => {
  if (usersWaitingForScanCode.has(ctx.from.id)) {
    const code = ctx.message.text.trim();

    try {
      const file = await scanFileModel.findOne({ code });
      if (!file) {
        return ctx.reply(
          `Kod "${code}" bo'yicha fayl topilmadi.\n\nKodni tekshirib qayta yuboring.`,
          Markup.inlineKeyboard([
            [Markup.button.callback("⬅️ Orqaga", "action_back_menu")],
          ])
        );
      }

      const isPaid = await paidModel.findOne({
        "serviceData._id": file._id,
        status: "paid",
      });
      if (!isPaid) {
        return ctx.reply(
          "Bu fayl uchun to'lov amalga oshirilmagan.",
          Markup.inlineKeyboard([
            [Markup.button.callback("⬅️ Orqaga", "action_back_menu")],
          ])
        );
      }

      await ctx.replyWithDocument(
        { source: file.file },
        {
          caption:
            `Fayl tayyor!\n\n` +
            `Kod: ${file.code}\n` +
            `Sana: ${new Date(file.createdAt).toLocaleString("uz-UZ")}`,
        }
      );

      usersWaitingForScanCode.delete(ctx.from.id);

      const session = await getUserSession(ctx.from.id);
      await ctx.reply(
        "Yana biror narsa kerakmi?",
        Markup.inlineKeyboard([
          [Markup.button.callback("📤 Fayl yuborish", "action_send_file")],
          [Markup.button.callback("📋 Scan faylni olish", "action_get_scan")],
          ...(session
            ? []
            : [
                [
                  Markup.button.callback(
                    "🖨 Apparatni tanlash",
                    "action_select_apparat"
                  ),
                ],
              ]),
        ])
      );
    } catch (error) {
      console.error("Scan fayl xatolik:", error);
      ctx.reply(
        "Xatolik yuz berdi. Qayta urinib ko'ring.",
        Markup.inlineKeyboard([
          [Markup.button.callback("⬅️ Orqaga", "action_back_menu")],
        ])
      );
    }
    return;
  }

  // Boshqa matnlar — asosiy menyu ko'rsatamiz
  const session = await getUserSession(ctx.from.id);
  await sendMainMenu(ctx, session);
});

// ---- Hujjat yuklash ----

bot.on("document", async (ctx) => {
  const session = await getUserSession(ctx.from.id);

  if (!session) {
    return ctx.reply(
      "Avval apparatni tanlang.\n\nQR kodni skanerlang yoki quyidan tanlang.",
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🖨 Apparatni tanlash",
            "action_select_apparat"
          ),
        ],
      ])
    );
  }

  const apparat = await getApparatInfo(session.apparatId);
  if (!apparat || apparat.holati !== "faol") {
    return ctx.reply(
      "Tanlangan apparat hozirda ishlamayapti. Boshqa apparatni tanlang.",
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🖨 Apparatni tanlash",
            "action_select_apparat"
          ),
        ],
      ])
    );
  }

  try {
    const file = ctx.message.document;
    const user = ctx.message.from;
    const apparatId = session.apparatId;

    if (!allowedFileTypes.includes(file.mime_type)) {
      const label = fileTypeLabels[file.mime_type] || file.mime_type;
      return ctx.reply(
        `"${label}" formati qabul qilinmaydi.\n\n` +
          `Qabul qilinadigan formatlar:\n` +
          `PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, PNG, JPEG`,
        Markup.inlineKeyboard([
          [Markup.button.callback("⬅️ Orqaga", "action_back_menu")],
        ])
      );
    }

    const uniqueCode = Math.floor(1000 + Math.random() * 9000).toString();
    const fileUrl = await getFileLink(file.file_id);
    const fileSizeFormatted = formatFileSize(file.file_size);
    const userProfilePhoto = await getUserProfilePhoto(ctx, user.id);

    const fileData = {
      fileId: file.file_id,
      fileName: file.file_name || `file_${Date.now()}`,
      fileType: file.mime_type,
      uniqueCode,
      apparatId,
      fileUrl,
      fileSize: fileSizeFormatted,
      user: {
        username: user.username || "Noma'lum",
        firstName: user.first_name || "Noma'lum",
        lastName: user.last_name || "",
        profilePic: userProfilePhoto,
      },
    };

    const savedFile = new File(fileData);
    await savedFile.save();

    const typeLabel = fileTypeLabels[file.mime_type] || "Fayl";

    await ctx.reply(
      `Fayl qabul qilindi!\n\n` +
        `Fayl: ${fileData.fileName}\n` +
        `Turi: ${typeLabel}\n` +
        `Hajmi: ${fileSizeFormatted}\n` +
        `Kod: ${uniqueCode}\n` +
        `Apparat: ${apparat.nomi}\n\n` +
        `Ushbu kodni saqlab qo'ying.\n` +
        `Yana fayl yuborishingiz mumkin.`,
      Markup.inlineKeyboard([
        [Markup.button.callback("📤 Yana fayl yuborish", "action_send_file")],
        [Markup.button.callback("🏠 Bosh menyu", "action_back_menu")],
      ])
    );

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
  } catch (error) {
    console.error("Fayl yuklash xatolik:", error);
    ctx.reply(
      "Faylni qabul qilishda xatolik yuz berdi. Qayta urinib ko'ring.",
      Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Orqaga", "action_back_menu")],
      ])
    );
  }
});

// ---- Rasm yuklash (compressed image) ----

bot.on("photo", async (ctx) => {
  const session = await getUserSession(ctx.from.id);

  if (!session) {
    return ctx.reply(
      "Avval apparatni tanlang.\n\nQR kodni skanerlang yoki quyidan tanlang.",
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🖨 Apparatni tanlash",
            "action_select_apparat"
          ),
        ],
      ])
    );
  }

  const apparat = await getApparatInfo(session.apparatId);
  if (!apparat || apparat.holati !== "faol") {
    return ctx.reply(
      "Tanlangan apparat hozirda ishlamayapti.",
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🖨 Apparatni tanlash",
            "action_select_apparat"
          ),
        ],
      ])
    );
  }

  try {
    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1]; // eng katta rasm
    const user = ctx.message.from;
    const apparatId = session.apparatId;

    const uniqueCode = Math.floor(1000 + Math.random() * 9000).toString();
    const fileUrl = await getFileLink(photo.file_id);
    const fileSizeFormatted = formatFileSize(photo.file_size || 0);
    const userProfilePhoto = await getUserProfilePhoto(ctx, user.id);

    const fileData = {
      fileId: photo.file_id,
      fileName: `photo_${Date.now()}.jpg`,
      fileType: "image/jpeg",
      uniqueCode,
      apparatId,
      fileUrl,
      fileSize: fileSizeFormatted,
      user: {
        username: user.username || "Noma'lum",
        firstName: user.first_name || "Noma'lum",
        lastName: user.last_name || "",
        profilePic: userProfilePhoto,
      },
    };

    const savedFile = new File(fileData);
    await savedFile.save();

    await ctx.reply(
      `Rasm qabul qilindi!\n\n` +
        `Hajmi: ${fileSizeFormatted}\n` +
        `Kod: ${uniqueCode}\n` +
        `Apparat: ${apparat.nomi}\n\n` +
        `Ushbu kodni saqlab qo'ying.`,
      Markup.inlineKeyboard([
        [Markup.button.callback("📤 Yana fayl yuborish", "action_send_file")],
        [Markup.button.callback("🏠 Bosh menyu", "action_back_menu")],
      ])
    );

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
  } catch (error) {
    console.error("Rasm yuklash xatolik:", error);
    ctx.reply("Rasmni qabul qilishda xatolik yuz berdi.");
  }
});

// ============ SOCKET.IO ============

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.on("apparatUlanish", (apparatId) => {
    console.log(`Apparat ulandi: ${apparatId}`);
    socket.apparatId = apparatId;
    socket.join(apparatId);

    File.find({ apparatId })
      .sort({ uploadedAt: -1 })
      .then((files) => {
        const filesWithLinks = files.map((file) => ({
          ...file.toObject(),
          fileLink: file.fileUrl,
        }));
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
        sana: { $gte: bugun },
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

// ============ API ROUTES ============

app.use("/api/admin", adminRouter);
app.use("/scan-file", ScanFileRouter);
app.use("/api/copy", copyRouter);
app.use("/api/click", clickRouter);
app.use("/api/payme", paymeRouter);
app.use("/api/v1/payme", paymeRouter);
app.use("/api/paid", PaidRouter);
app.use("/api/vending-apparat", vendingApparatRouter);
app.use("/api/statistika", statistikaRouter);
app.use("/api/settings", settingsRouter);

// ---- QR Code API ----

app.get("/api/vending-apparat/:apparatId/qrcode", async (req, res) => {
  try {
    const { apparatId } = req.params;
    const apparat = await VendingApparat.findOne({ apparatId });

    if (!apparat) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Apparat topilmadi" });
    }

    const deeplink = `https://t.me/${botUsername}?start=${apparatId}`;

    const qrDataUrl = await QRCode.toDataURL(deeplink, {
      width: 512,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    res.json({
      muvaffaqiyat: true,
      malumot: {
        apparatId,
        nomi: apparat.nomi,
        deeplink,
        qrCode: qrDataUrl,
      },
    });
  } catch (error) {
    console.error("QR code xatolik:", error);
    res
      .status(500)
      .json({ muvaffaqiyat: false, xabar: "QR kod yaratishda xatolik" });
  }
});

// ---- Fayllar API ----

app.get("/files", async (req, res) => {
  try {
    const { apparatId } = req.query;
    if (!apparatId) {
      return res.status(400).json({ xato: "ApparatId ko'rsatilmagan" });
    }

    const files = await File.find({ apparatId }).sort({ uploadedAt: -1 });
    const filesWithLinks = files.map((file) => ({
      ...file.toObject(),
      fileLink: file.fileUrl,
    }));
    res.json(filesWithLinks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Fayllarni olishda xatolik yuz berdi." });
  }
});

app.get("/admin/files", async (req, res) => {
  try {
    const files = await File.find().sort({ uploadedAt: -1 });
    const filesWithLinks = files.map((file) => ({
      ...file.toObject(),
      fileLink: file.fileUrl,
    }));
    res.json({ muvaffaqiyat: true, malumot: filesWithLinks });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({
        muvaffaqiyat: false,
        xabar: "Fayllarni olishda xatolik yuz berdi.",
      });
  }
});

app.delete("/files/all-delete", async (req, res) => {
  try {
    await File.deleteMany({});
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

// ============ START ============

bot.launch({ polling: true });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

const PORT = process.env.PORT || 8008;
server.listen(PORT, () => console.log(`Server ${PORT}-portda ishlayapti`));
