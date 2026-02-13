/**
 * RBAC Migratsiya skripti
 *
 * Bu skript mavjud bazani yangi RBAC tizimiga moslashtiradi:
 * 1. Hozirgi adminni superadmin ga o'zgartiradi
 * 2. .env dagi Click credentiallarni shifrlaydi va superadminga saqlaydi
 * 3. Barcha apparatlarga default narxlar qo'shadi
 * 4. Barcha apparatlarni superadmin ga tayinlaydi
 *
 * Ishlatish: node scripts/migrate-rbac.js
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import Admin from "../model/admin.model.js";
import VendingApparat from "../model/vendingApparat.model.js";
import Settings from "../model/settings.model.js";
import { encrypt } from "../utils/encryption.js";

config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/flash-print";

async function migrate() {
  try {
    console.log("MongoDB ga ulanmoqda...");
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB ga ulandi!");

    // 1. Mavjud adminni superadmin qilish
    console.log("\n=== 1-qadam: Adminlarni yangilash ===");
    const admins = await Admin.find();

    if (admins.length === 0) {
      console.log("Bazada admin topilmadi. Migratsiya tugadi.");
      process.exit(0);
    }

    for (const admin of admins) {
      // Mavjud adminlar superadmin bo'ladi (Mongoose default "admin" qo'yadi)
      if (admin.role === "admin" || !admin.role) {
        admin.role = "superadmin";
      }
      if (!admin.firstName) {
        admin.firstName = "Super";
      }
      if (!admin.lastName) {
        admin.lastName = "Admin";
      }
      if (!admin.phone) {
        admin.phone = "+998000000000";
      }

      // .env dagi Click credentiallarni shifrlash
      const clickSecretKey = process.env.CLICK_SECRET_KEY;
      const clickServiceId = process.env.CLICK_SERVICE_ID;
      const clickMerchantId = process.env.CLICK_MERCHANT_ID;
      const clickMerchantUserId = process.env.CLICK_MERCHANT_USER_ID;

      if (clickSecretKey && !admin.clickCredentials?.secretKey?.iv) {
        admin.clickCredentials = {
          secretKey: encrypt(clickSecretKey),
          serviceId: encrypt(clickServiceId || ""),
          merchantId: encrypt(clickMerchantId || ""),
          merchantUserId: encrypt(clickMerchantUserId || ""),
        };
        console.log(`  Click credentials shifrlandi va ${admin.username} ga saqlandi`);
      }

      await admin.save();
      console.log(`  Admin "${admin.username}" -> role: ${admin.role}, name: ${admin.firstName} ${admin.lastName}`);
    }

    // 2. Settings dan default narxlarni olish
    console.log("\n=== 2-qadam: Default narxlarni olish ===");
    let settings = await Settings.findOne();
    const defaultNarxlar = {
      printOneSide: settings?.printOneSide || 500,
      printTwoSide: settings?.printTwoSide || 800,
      scanOneSide: settings?.scanOneSide || 500,
      scanTwoSide: settings?.scanTwoSide || 800,
      copyOneSide: settings?.copyOneSide || 500,
      copyTwoSide: settings?.copyTwoSide || 800,
    };
    console.log("  Default narxlar:", defaultNarxlar);

    // 3. Apparatlarni yangilash
    console.log("\n=== 3-qadam: Apparatlarni yangilash ===");
    const superAdmin = await Admin.findOne({ role: "superadmin" });
    const apparatlar = await VendingApparat.find();

    for (const apparat of apparatlar) {
      let changed = false;

      // adminId tayinlash
      if (!apparat.adminId && superAdmin) {
        apparat.adminId = superAdmin._id;
        changed = true;
      }

      // narxlar qo'shish
      if (!apparat.narxlar || !apparat.narxlar.printOneSide) {
        apparat.narxlar = defaultNarxlar;
        changed = true;
      }

      if (changed) {
        await apparat.save();
        console.log(`  Apparat "${apparat.nomi}" (${apparat.apparatId}) yangilandi`);
      } else {
        console.log(`  Apparat "${apparat.nomi}" (${apparat.apparatId}) - o'zgarish kerak emas`);
      }
    }

    console.log("\n=== Migratsiya muvaffaqiyatli tugadi! ===");
    console.log(`  Adminlar: ${admins.length}`);
    console.log(`  Apparatlar: ${apparatlar.length}`);

    process.exit(0);
  } catch (error) {
    console.error("Migratsiya xatoligi:", error);
    process.exit(1);
  }
}

migrate();
