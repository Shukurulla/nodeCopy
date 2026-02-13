# Flash Print — API Documentation

> **Base URL:** `https://flash-print.uz`
>
> **Versiya:** 2.0 (RBAC tizimi bilan)
>
> **Oxirgi yangilanish:** 2026-02-13

---

## Mundarija

1. [Autentifikatsiya](#1-autentifikatsiya)
2. [Admin API](#2-admin-api)
3. [Vending Apparat API](#3-vending-apparat-api)
4. [Statistika API](#4-statistika-api)
5. [To'lovlar (Paid) API](#5-tolovlar-paid-api)
6. [Click To'lov API](#6-click-tolov-api)
7. [Payme To'lov API](#7-payme-tolov-api)
8. [Sozlamalar (Settings) API](#8-sozlamalar-settings-api)
9. [Scan File API](#9-scan-file-api)
10. [Copy API](#10-copy-api)
11. [Fayllar API](#11-fayllar-api)
12. [QR Code API](#12-qr-code-api)
13. [Socket.IO Eventlar](#13-socketio-eventlar)
14. [Ma'lumotlar Modellari](#14-malumotlar-modellari)
15. [Xatolik Kodlari](#15-xatolik-kodlari)

---

## 0. ATM (Vending Apparat) So'rovlari

ATM qurilmasidan keluvchi barcha so'rovlarda `apparatId` headerda yuboriladi. Backend shu header orqali apparatga tegishli ma'lumotlarni (narxlar, credentials va h.k.) qaytaradi.

**Header format:**
```
apparatid: APPARAT001
```

**ATM endpointlar ro'yxati:**

| # | Method | URL | Tavsif |
|---|--------|-----|--------|
| 1 | POST | `/api/click/get-click-link` | Print to'lov havolasi (Click) |
| 2 | POST | `/api/click/get-scan-link` | Scan to'lov havolasi (Click) |
| 3 | POST | `/api/click/get-copy-link` | Copy to'lov havolasi (Click) |
| 4 | POST | `/api/click/check-payment-status` | To'lov holatini tekshirish |
| 5 | GET | `/api/settings` | Narxlar (apparat narxlari yoki global default) |
| 6 | GET | `/api/vending-apparat/:apparatId/qogoz-qoldiq` | Qog'oz qoldig'i |
| 7 | GET | `/files?apparatId=` | Telegram orqali yuklangan fayllar |
| 8 | GET | `/download/:fileId` | Fayl yuklash (download) |
| 9 | POST | `/api/copy/create` | Copy yaratish |
| 10 | GET | `/api/copy/get-by-code/:code` | Copy kodni tekshirish |
| 11 | POST | `/scan-file/upload` | Scan fayl yuklash |
| 12 | POST | `/api/payme/get-payme-link` | Print to'lov havolasi (Payme) |
| 13 | POST | `/api/payme/get-scan-payme-link` | Scan to'lov havolasi (Payme) |

**Muhim:**
- `GET /api/settings` — headerda `apparatid` bo'lsa, shu apparatning o'z `narxlar`i qaytariladi. Bo'lmasa global default narxlar.
- `POST /scan-file/upload` — headerda `apparatid` bo'lsa, scan faylga apparatId saqlanadi (dinamik Click credentials uchun kerak).
- Click/Payme to'lov endpointlari — `apparatId` fayl/scan/copy obyektidan olinadi va shu apparat adminining Click/Payme credentialslari ishlatiladi.
- Barcha ATM endpointlari **auth talab qilmaydi** (public).

---

## 1. Autentifikatsiya

Barcha himoyalangan endpointlar JWT token talab qiladi.

**Header format:**

```
Authorization: Bearer <JWT_TOKEN>
```

**Token tarkibi (payload):**

```json
{
  "adminId": "MongoDB ObjectId",
  "username": "string",
  "role": "superadmin | admin"
}
```

**Token muddati:** 1 kun (24 soat)

### Rollar

| Rol          | Tavsif                                                                 |
| ------------ | ---------------------------------------------------------------------- |
| `superadmin` | Tizimni to'liq boshqaradi. Adminlar yaratadi, apparatlarni tayinlaydi. |
| `admin`      | Faqat o'ziga tayinlangan apparatlarni boshqaradi.                      |

---

## 2. Admin API

**Base path:** `/api/admin`

### 2.1 Login

```
POST /api/admin/login
```

**Auth:** Yo'q

**Request Body:**

```json
{
  "username": "string (majburiy)",
  "password": "string (majburiy)"
}
```

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": {
    "token": "JWT_TOKEN",
    "admin": {
      "id": "ObjectId",
      "username": "admin1",
      "role": "admin",
      "firstName": "Ali",
      "lastName": "Valiyev"
    }
  }
}
```

**Xatoliklar:**

- `400` — Noto'g'ri foydalanuvchi nomi yoki parol
- `403` — Akkaunt faol emas

---

### 2.2 Signup (birinchi marta superadmin yaratish)

```
POST /api/admin/signup
```

**Auth:** Yo'q

**Request Body:**

```json
{
  "username": "string (majburiy)",
  "password": "string (majburiy)",
  "firstName": "string (default: 'Super')",
  "lastName": "string (default: 'Admin')",
  "phone": "string (default: '+998000000000')"
}
```

**Muvaffaqiyatli javob (201):**

```json
{
  "muvaffaqiyat": true,
  "malumot": {
    "id": "ObjectId",
    "username": "superadmin",
    "role": "superadmin"
  }
}
```

---

### 2.3 O'z profilini olish

```
GET /api/admin/profil
```

**Auth:** Bearer Token (har qanday admin)

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": {
    "_id": "ObjectId",
    "username": "admin1",
    "firstName": "Ali",
    "lastName": "Valiyev",
    "phone": "+998901234567",
    "role": "admin",
    "isActive": true,
    "clickCredentialsDecrypted": {
      "secretKey": "deshifrlangan_kalit",
      "serviceId": "71257",
      "merchantId": "38721",
      "merchantUserId": "12345"
    }
  }
}
```

---

### 2.4 O'z Click credentials ni yangilash

```
PUT /api/admin/profil/click
```

**Auth:** Bearer Token (har qanday admin — o'ziniki)

**Request Body:**

```json
{
  "clickSecretKey": "string (ixtiyoriy)",
  "clickServiceId": "string (ixtiyoriy)",
  "clickMerchantId": "string (ixtiyoriy)",
  "clickMerchantUserId": "string (ixtiyoriy)"
}
```

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "xabar": "Click ma'lumotlari yangilandi"
}
```

---

### 2.5 Barcha adminlar ro'yxati

```
GET /api/admin/all
```

**Auth:** Bearer Token (faqat `superadmin`)

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": [
    {
      "_id": "ObjectId",
      "username": "admin1",
      "firstName": "Ali",
      "lastName": "Valiyev",
      "phone": "+998901234567",
      "role": "admin",
      "isActive": true,
      "apparatlarSoni": 3,
      "createdAt": "2026-01-15T10:00:00.000Z"
    }
  ]
}
```

---

### 2.6 Admin tafsilotlari

```
GET /api/admin/:id
```

**Auth:** Bearer Token (faqat `superadmin`)

**Path parametrlar:**
| Parametr | Tur | Tavsif |
|----------|-----|--------|
| `id` | ObjectId | Admin ID |

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": {
    "_id": "ObjectId",
    "username": "admin1",
    "firstName": "Ali",
    "lastName": "Valiyev",
    "phone": "+998901234567",
    "role": "admin",
    "isActive": true,
    "clickCredentials": { "...shifrlangan..." },
    "clickCredentialsDecrypted": {
      "secretKey": "ochiq_kalit",
      "serviceId": "71257",
      "merchantId": "38721",
      "merchantUserId": "12345"
    },
    "apparatlar": [
      {
        "_id": "ObjectId",
        "apparatId": "APPARAT001",
        "nomi": "Flash Print #1",
        "joylashuv": "TATU, 1-qavat"
      }
    ]
  }
}
```

---

### 2.7 Yangi admin yaratish

```
POST /api/admin/create
```

**Auth:** Bearer Token (faqat `superadmin`)

**Request Body:**

```json
{
  "username": "string (majburiy)",
  "password": "string (majburiy)",
  "firstName": "string (majburiy)",
  "lastName": "string (majburiy)",
  "phone": "string (majburiy, format: +998XXXXXXXXX)",
  "clickSecretKey": "string (ixtiyoriy)",
  "clickServiceId": "string (ixtiyoriy)",
  "clickMerchantId": "string (ixtiyoriy)",
  "clickMerchantUserId": "string (ixtiyoriy)"
}
```

**Muvaffaqiyatli javob (201):**

```json
{
  "muvaffaqiyat": true,
  "malumot": {
    "id": "ObjectId",
    "username": "admin1",
    "firstName": "Ali",
    "lastName": "Valiyev",
    "phone": "+998901234567",
    "role": "admin"
  }
}
```

---

### 2.8 Admin tahrirlash

```
PUT /api/admin/:id
```

**Auth:** Bearer Token (faqat `superadmin`)

**Request Body (barcha maydonlar ixtiyoriy):**

```json
{
  "firstName": "string",
  "lastName": "string",
  "phone": "string",
  "password": "string",
  "isActive": "boolean",
  "clickSecretKey": "string",
  "clickServiceId": "string",
  "clickMerchantId": "string",
  "clickMerchantUserId": "string"
}
```

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": {
    "id": "ObjectId",
    "username": "admin1",
    "firstName": "Ali",
    "lastName": "Valiyev",
    "phone": "+998901234567",
    "role": "admin",
    "isActive": true
  }
}
```

---

### 2.9 Admin o'chirish

```
DELETE /api/admin/:id
```

**Auth:** Bearer Token (faqat `superadmin`)

**Muhim:** Superadminni o'chirib bo'lmaydi. O'chirilgan admin apparatlari avtomatik ajratiladi (`adminId: null`).

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "xabar": "Admin o'chirildi"
}
```

---

### 2.10 Apparatni adminga tayinlash

```
POST /api/admin/assign-apparat
```

**Auth:** Bearer Token (faqat `superadmin`)

**Request Body:**

```json
{
  "adminId": "ObjectId (majburiy) — admin ID",
  "apparatId": "string (majburiy) — apparat identifikatori (masalan: APPARAT001)"
}
```

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "xabar": "Flash Print #1 apparati Ali Valiyev ga tayinlandi"
}
```

---

### 2.11 Apparatni admindan ajratish

```
POST /api/admin/unassign-apparat
```

**Auth:** Bearer Token (faqat `superadmin`)

**Request Body:**

```json
{
  "apparatId": "string (majburiy) — apparat identifikatori"
}
```

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "xabar": "Flash Print #1 apparati ajratildi"
}
```

---

## 3. Vending Apparat API

**Base path:** `/api/vending-apparat`

### 3.1 Barcha apparatlarni olish (role-based)

```
GET /api/vending-apparat
```

**Auth:** Bearer Token

**Muhim:** Oddiy admin faqat o'z apparatlarini ko'radi. Superadmin barcha apparatlarni ko'radi.

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": [
    {
      "_id": "ObjectId",
      "apparatId": "APPARAT001",
      "nomi": "Flash Print #1",
      "joylashuv": "TATU, 1-qavat",
      "qogozSigimi": 1000,
      "joriyQogozSoni": 763,
      "kamQogozChegarasi": 900,
      "oxirgiToladirishVaqti": "2026-01-20T14:30:00.000Z",
      "adminId": {
        "_id": "ObjectId",
        "firstName": "Ali",
        "lastName": "Valiyev",
        "username": "admin1"
      },
      "narxlar": {
        "printOneSide": 500,
        "printTwoSide": 800,
        "scanOneSide": 500,
        "scanTwoSide": 800,
        "copyOneSide": 500,
        "copyTwoSide": 800
      }
    }
  ]
}
```

---

### 3.2 Bitta apparatni olish

```
GET /api/vending-apparat/:id
```

**Auth:** Bearer Token

**Path parametrlar:**
| Parametr | Tur | Tavsif |
|----------|-----|--------|
| `id` | ObjectId | Apparat MongoDB ID |

**Muhim:** Oddiy admin faqat o'z apparatini ko'ra oladi.

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": {
    "_id": "ObjectId",
    "apparatId": "APPARAT001",
    "nomi": "Flash Print #1",
    "...": "yuqoridagi kabi"
  }
}
```

---

### 3.3 Yangi apparat yaratish

```
POST /api/vending-apparat
```

**Auth:** Bearer Token (faqat `superadmin`)

**Request Body:**

```json
{
  "apparatId": "string (majburiy) — noyob identifikator",
  "nomi": "string (majburiy)",
  "joylashuv": "string",
  "qogozSigimi": "number (default: 1000)",
  "joriyQogozSoni": "number (default: 0)",
  "kamQogozChegarasi": "number (default: 100)",
  "adminId": "ObjectId (ixtiyoriy) — kimga tayinlanadi",
  "narxlar": {
    "printOneSide": "number (default: 500)",
    "printTwoSide": "number (default: 800)",
    "scanOneSide": "number (default: 500)",
    "scanTwoSide": "number (default: 800)",
    "copyOneSide": "number (default: 500)",
    "copyTwoSide": "number (default: 800)"
  }
}
```

**Muvaffaqiyatli javob (201):**

```json
{
  "muvaffaqiyat": true,
  "malumot": { "...yaratilgan apparat..." }
}
```

---

### 3.4 Apparatni tahrirlash

```
PUT /api/vending-apparat/:id
```

**Auth:** Bearer Token

**Ruxsatlar:**

- **Biriktirilgan admin:** O'z apparatini to'liq tahrirlaydi (adminId dan tashqari)
- **Superadmin (biriktirilmagan apparat):** To'liq tahrirlaydi
- **Superadmin (biriktirilgan apparat):** Faqat `adminId` ni o'zgartira oladi

**Request Body (barcha maydonlar ixtiyoriy):**

```json
{
  "nomi": "string",
  "joylashuv": "string",
  "qogozSigimi": "number",
  "kamQogozChegarasi": "number",
  "adminId": "ObjectId | null (faqat superadmin)"
}
```

---

### 3.5 Qog'oz sonini yangilash

```
PUT /api/vending-apparat/:id/qogoz
```

**Auth:** Bearer Token (apparat egasi yoki biriktirilmagan apparatda superadmin)

**Request Body:**

```json
{
  "soni": "number (majburiy) — qog'oz soni",
  "add": "boolean (default: false) — true = qo'shish, false = to'g'ridan-to'g'ri o'rnatish"
}
```

**Validatsiyalar:**

- `soni` 0 dan kam bo'lmasligi kerak
- `add: true` da: joriy + soni <= qogozSigimi bo'lishi kerak
- `add: false` da: soni <= qogozSigimi bo'lishi kerak

**Socket event:** Muvaffaqiyatli bo'lganda `qogozYangilandi` eventi yuboriladi.

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": { "...yangilangan apparat..." }
}
```

---

### 3.6 Apparat narxlarini olish

```
GET /api/vending-apparat/:id/narxlar
```

**Auth:** Bearer Token

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": {
    "printOneSide": 500,
    "printTwoSide": 800,
    "scanOneSide": 500,
    "scanTwoSide": 800,
    "copyOneSide": 500,
    "copyTwoSide": 800
  }
}
```

---

### 3.7 Apparat narxlarini yangilash

```
PUT /api/vending-apparat/:id/narxlar
```

**Auth:** Bearer Token (apparat egasi yoki biriktirilmagan apparatda superadmin)

**Request Body (barcha maydonlar ixtiyoriy):**

```json
{
  "printOneSide": "number (>= 0)",
  "printTwoSide": "number (>= 0)",
  "scanOneSide": "number (>= 0)",
  "scanTwoSide": "number (>= 0)",
  "copyOneSide": "number (>= 0)",
  "copyTwoSide": "number (>= 0)"
}
```

---

### 3.8 Apparat statistikasi

```
GET /api/vending-apparat/:id/statistika
```

**Auth:** Bearer Token

**Query parametrlar:**
| Parametr | Tur | Tavsif |
|----------|-----|--------|
| `davr` | string | `kun`, `hafta`, `oy`, `yil` |

---

### 3.9 Apparatni o'chirish

```
DELETE /api/vending-apparat/:id
```

**Auth:** Bearer Token (faqat `superadmin`)

---

### 3.10 Qog'oz qoldig'ini olish (PUBLIC — ATM uchun)

```
GET /api/vending-apparat/:apparatId/qogoz-qoldiq
```

**Auth:** Yo'q (public endpoint)

**Path parametrlar:**
| Parametr | Tur | Tavsif |
|----------|-----|--------|
| `apparatId` | string | Apparat identifikatori (masalan: `APPARAT001`) |

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": {
    "apparatId": "APPARAT001",
    "nomi": "Flash Print #1",
    "joriyQogozSoni": 763,
    "qogozSigimi": 1000,
    "kamQogozChegarasi": 900,
    "qogozFoiz": 76,
    "kamQoldimi": true
  }
}
```

---

### 3.11 Narxlarni olish (PUBLIC — ATM uchun)

```
GET /api/vending-apparat/:apparatId/narxlar-public
```

**Auth:** Yo'q (public endpoint)

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": {
    "apparatId": "APPARAT001",
    "nomi": "Flash Print #1",
    "narxlar": {
      "printOneSide": 500,
      "printTwoSide": 800,
      "scanOneSide": 500,
      "scanTwoSide": 800,
      "copyOneSide": 500,
      "copyTwoSide": 800
    }
  }
}
```

---

## 4. Statistika API

**Base path:** `/api/statistika`

### 4.1 Umumiy statistika

```
GET /api/statistika
```

**Auth:** Bearer Token

**Muhim:** Oddiy admin faqat o'z apparatlari statistikasini ko'radi.

**Query parametrlar:**
| Parametr | Tur | Tavsif |
|----------|-----|--------|
| `davr` | string | `kun`, `hafta`, `oy`, `yil`, `custom` |
| `apparatId` | string | Apparat identifikatori yoki `all` |
| `boshlanishSana` | string | `custom` davr uchun (format: YYYY-MM-DD) |
| `tugashSana` | string | `custom` davr uchun (format: YYYY-MM-DD) |

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": [
    {
      "_id": "ObjectId",
      "apparatId": "APPARAT001",
      "sana": "2026-02-13T00:00:00.000Z",
      "foydalanishSoni": 15,
      "daromad": 25000,
      "ishlatilganQogoz": 20
    }
  ]
}
```

---

### 4.2 Guruhlangan statistika

```
GET /api/statistika/guruh
```

**Auth:** Bearer Token

**Query parametrlar:** Yuqoridagi kabi (`davr`, `apparatId`, `boshlanishSana`, `tugashSana`)

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": [
    {
      "_id": "2026-02-13",
      "foydalanishSoni": 45,
      "daromad": 75000,
      "ishlatilganQogoz": 60
    }
  ]
}
```

**Guruhlash formatlari:**

- `davr=kun` → `%Y-%m-%d`
- `davr=oy` → `%Y-%m`
- `davr=yil` → `%Y`
- Boshqalar → `%Y-%m-%d`

---

### 4.3 Apparatlar bo'yicha statistika

```
GET /api/statistika/apparatlar
```

**Auth:** Bearer Token

**Query parametrlar:**
| Parametr | Tur | Tavsif |
|----------|-----|--------|
| `davr` | string | `kun`, `hafta`, `oy`, `yil`, `custom` |
| `boshlanishSana` | string | `custom` davr uchun |
| `tugashSana` | string | `custom` davr uchun |

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": [
    {
      "_id": "APPARAT001",
      "foydalanishSoni": 120,
      "daromad": 250000,
      "ishlatilganQogoz": 150
    }
  ]
}
```

---

### 4.4 Kunlik statistika (so'nggi 30 kun)

```
GET /api/statistika/kunlik
```

**Auth:** Bearer Token

**Query parametrlar:**
| Parametr | Tur | Tavsif |
|----------|-----|--------|
| `apparatId` | string | Apparat identifikatori yoki `all` |

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": [
    {
      "_id": "2026-02-01",
      "foydalanishSoni": 45,
      "daromad": 75000,
      "ishlatilganQogoz": 60
    }
  ]
}
```

---

## 5. To'lovlar (Paid) API

**Base path:** `/api/paid`

### 5.1 Barcha to'lovlarni olish (role-based)

```
GET /api/paid/all
```

**Auth:** Bearer Token

**Muhim:** Oddiy admin faqat o'z apparatlari to'lovlarini ko'radi.

**Muvaffaqiyatli javob (200):**

```json
{
  "status": "success",
  "data": [
    {
      "_id": "ObjectId",
      "serviceData": {
        "_id": "ObjectId",
        "apparatId": "APPARAT001",
        "fileName": "document.pdf",
        "...": "fayl yoki scan/copy ma'lumotlari"
      },
      "status": "paid",
      "amount": 500,
      "date": "2026-02-13T10:30:00.000Z",
      "paymentMethod": "click",
      "clickTransactionId": "12345678"
    }
  ]
}
```

---

### 5.2 To'lov holatini o'zgartirish

```
PUT /api/paid/:id/status
```

**Auth:** Bearer Token

**Request Body:**

```json
{
  "status": "string — 'paid' | 'pending' | 'cancelled'"
}
```

**Socket event:** Muvaffaqiyatli bo'lganda `tolovStatusYangilandi` eventi yuboriladi.

---

### 5.3 Barcha to'lovlarni o'chirish

```
GET /api/paid/delete-all
```

**Auth:** Bearer Token (faqat `superadmin`)

---

## 6. Click To'lov API

**Base path:** `/api/click`

### 6.1 Prepare (Click serveridan keladi)

```
POST /api/click/prepare
```

**Auth:** Click signature tekshirish

**Tavsif:** Click to'lov tizimidan keluvchi tayyorlash so'rovi. Signature dinamik ravishda apparat → admin → Click credentials orqali tekshiriladi.

**Request Body (Click yuboradi):**

```json
{
  "click_trans_id": "string",
  "service_id": "string",
  "merchant_trans_id": "string — File/Scan/Copy MongoDB ID",
  "amount": "number",
  "action": "0",
  "sign_time": "string",
  "sign_string": "string — MD5 hash"
}
```

**Ishlash tartibi:**

1. `merchant_trans_id` orqali File, ScanFile, yoki Copy topiladi
2. Topilgan obyektdan `apparatId` olinadi
3. `apparatId` → VendingApparat → `adminId` → Admin → `clickCredentials` deshifrlanadi
4. Dinamik `secretKey`, `serviceId` bilan signature tekshiriladi
5. Agar admin credentials topilmasa, fallback `.env` credentials ishlatiladi

**Muvaffaqiyatli javob (200):**

```json
{
  "click_trans_id": "string",
  "merchant_trans_id": "string",
  "merchant_prepare_id": "number — timestamp",
  "error": 0,
  "error_note": "Success"
}
```

---

### 6.2 Complete (Click serveridan keladi)

```
POST /api/click/complete
```

**Auth:** Click signature tekshirish

**Tavsif:** To'lovni yakunlash. Muvaffaqiyatli to'lovdan keyin:

- `Paid` yozuvi yaratiladi
- Statistika yangilanadi (foydalanishSoni, daromad, ishlatilganQogoz)
- Apparat qog'oz soni 1 ga kamayadi
- Qog'oz kam bo'lsa `qogozKam` socket eventi yuboriladi
- File/Copy o'chiriladi (skanerlash bundan mustasno)
- `tolovMuvaffaqiyatli` socket eventi yuboriladi

**Request Body (Click yuboradi):**

```json
{
  "click_trans_id": "string",
  "service_id": "string",
  "merchant_trans_id": "string",
  "merchant_prepare_id": "string",
  "amount": "number",
  "action": "1",
  "sign_time": "string",
  "sign_string": "string",
  "error": "0 | xatolik kodi"
}
```

---

### 6.3 To'lov holatini tekshirish

```
POST /api/click/check-payment-status
```

**Auth:** Yo'q

**Request Body:**

```json
{
  "order_id": "string — File/Scan/Copy MongoDB ID"
}
```

**Muvaffaqiyatli javob (200):**

```json
{
  "status": "success",
  "message": "To'landi",
  "paid": true,
  "data": {
    "amount": 500,
    "date": "2026-02-13T10:30:00.000Z",
    "click_trans_id": "12345678"
  }
}
```

---

### 6.4 File uchun Click to'lov havolasi

```
POST /api/click/get-click-link
```

**Auth:** Yo'q

**Request Body:**

```json
{
  "orderId": "string (majburiy) — File MongoDB ID",
  "amount": "number (majburiy, >= 100)"
}
```

**Muvaffaqiyatli javob (200):**

```json
{
  "status": "success",
  "data": "https://my.click.uz/services/pay?service_id=71257&merchant_id=38721&amount=500&transaction_param=FILE_ID"
}
```

**Muhim:** `service_id` va `merchant_id` dinamik — apparat → admin → Click credentials dan olinadi.

---

### 6.5 Scan uchun Click to'lov havolasi

```
POST /api/click/get-scan-link
```

**Auth:** Yo'q

**Request Body:**

```json
{
  "code": "string (majburiy) — 5 xonali scan kodi",
  "amount": "number (majburiy, >= 100)"
}
```

**Muvaffaqiyatli javob (200):**

```json
{
  "status": "success",
  "data": {
    "payment_url": "https://my.click.uz/services/pay?...",
    "order_id": "ObjectId",
    "amount": 500,
    "code": "12345"
  }
}
```

---

### 6.6 Copy uchun Click to'lov havolasi

```
POST /api/click/get-copy-link
```

**Auth:** Yo'q

**Request Body:**

```json
{
  "code": "string (majburiy) — 5 xonali copy kodi",
  "amount": "number (majburiy, >= 100)"
}
```

**Muvaffaqiyatli javob (200):**

```json
{
  "status": "success",
  "data": {
    "payment_url": "https://my.click.uz/services/pay?...",
    "order_id": "ObjectId",
    "amount": 500,
    "code": "12345",
    "apparatId": "APPARAT001"
  }
}
```

---

### 6.7 Test endpoint

```
GET /api/click/test
```

**Auth:** Yo'q

**Javob:** Click router ishlayotganligini tekshirish.

---

## 7. Payme To'lov API

**Base path:** `/api/payme` va `/api/v1/payme`

### 7.1 File uchun Payme to'lov havolasi

```
POST /api/payme/get-payme-link
```

**Auth:** Yo'q

**Request Body:**

```json
{
  "orderId": "string (majburiy) — File MongoDB ID",
  "amount": "number (majburiy) — tiyin hisobida",
  "returnUrl": "string (ixtiyoriy)"
}
```

**Muvaffaqiyatli javob (200):**

```json
{
  "status": "success",
  "data": {
    "payment_link": "https://checkout.paycom.uz/BASE64_ENCODED",
    "amount": 50000,
    "order_id": "ObjectId",
    "merchant_id": "PAYME_MERCHANT_ID"
  }
}
```

---

### 7.2 Scan file uchun Payme to'lov havolasi

```
POST /api/payme/get-scan-payme-link
```

**Auth:** Yo'q

**Request Body:**

```json
{
  "code": "string (majburiy) — 5 xonali scan kodi",
  "amount": "number (majburiy) — tiyin hisobida",
  "returnUrl": "string (ixtiyoriy)"
}
```

---

### 7.3 Payme Webhook

```
POST /api/payme/updates
```

**Auth:** Basic Auth (Payme kalit bilan)

**Tavsif:** Payme to'lov tizimidan keluvchi JSON-RPC 2.0 so'rovlari.

**Qo'llab-quvvatlanadigan metodlar:**

#### CheckPerformTransaction

To'lov amalga oshirish mumkinligini tekshirish.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "CheckPerformTransaction",
  "params": {
    "amount": 50000,
    "account": {
      "order_id": "File/Scan MongoDB ID"
    }
  }
}
```

**Muvaffaqiyatli javob:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "allow": true,
    "detail": {
      "receipt_type": 0,
      "items": [{ "title": "Vending apparat chop etish xizmati", "..." }]
    }
  }
}
```

#### CreateTransaction

Yangi tranzaksiya yaratish.

```json
{
  "method": "CreateTransaction",
  "params": {
    "id": "Payme transaction ID",
    "time": 1707820800000,
    "amount": 50000,
    "account": { "order_id": "ObjectId" }
  }
}
```

#### PerformTransaction

To'lovni amalga oshirish. Muvaffaqiyatli bo'lganda:

- Statistika yangilanadi
- Apparat qog'oz soni kamayadi
- `tolovMuvaffaqiyatli` socket eventi yuboriladi

```json
{
  "method": "PerformTransaction",
  "params": { "id": "Payme transaction ID" }
}
```

#### CancelTransaction

To'lovni bekor qilish. Agar to'lov amalga oshirilgan bo'lsa, statistika qaytariladi.

```json
{
  "method": "CancelTransaction",
  "params": {
    "id": "Payme transaction ID",
    "reason": 1
  }
}
```

#### CheckTransaction

Tranzaksiya holatini tekshirish.

```json
{
  "method": "CheckTransaction",
  "params": { "id": "Payme transaction ID" }
}
```

#### GetStatement

Belgilangan davr uchun tranzaksiyalar ro'yxati.

```json
{
  "method": "GetStatement",
  "params": {
    "from": 1707734400000,
    "to": 1707820800000
  }
}
```

**Payme tranzaksiya holatlari:**
| State | Qiymat | Tavsif |
|-------|--------|--------|
| Pending | `1` | Kutilmoqda |
| Paid | `2` | To'langan |
| PendingCanceled | `-1` | Kutilayotgan holda bekor qilingan |
| PaidCanceled | `-2` | To'langan holda bekor qilingan |

---

### 7.4 Debug endpointlar

| Method | URL                                           | Tavsif                         |
| ------ | --------------------------------------------- | ------------------------------ |
| GET    | `/api/payme/debug-order/:orderId`             | Order va uning tranzaksiyalari |
| GET    | `/api/payme/debug-transaction/:transactionId` | Tranzaksiya tafsilotlari       |
| GET    | `/api/payme/test-detail`                      | Detail obyekti namunasi        |
| GET    | `/api/payme/test-merchant`                    | Merchant ID tekshirish         |
| GET    | `/api/payme/test-transactions`                | So'nggi 10 Payme tranzaksiya   |
| GET    | `/api/payme/test-order/:orderId`              | Order mavjudligini tekshirish  |

---

## 8. Sozlamalar (Settings) API

**Base path:** `/api/settings`

### 8.1 Narxlarni olish

```
GET /api/settings
```

**Auth:** Yo'q (public endpoint — ATM va admin panel uchun)

**Header (ixtiyoriy):**
```
apparatid: APPARAT001
```

**Tavsif:**
- Agar headerda `apparatid` bo'lsa — shu apparat `narxlar`i qaytariladi
- Agar headerda `apparatid` yo'q yoki apparat topilmasa — global default narxlar qaytariladi

**Muvaffaqiyatli javob (200) — apparat narxlari:**

```json
{
  "muvaffaqiyat": true,
  "malumot": {
    "printOneSide": 500,
    "printTwoSide": 800,
    "scanOneSide": 500,
    "scanTwoSide": 800,
    "copyOneSide": 500,
    "copyTwoSide": 800
  }
}
```

**Muvaffaqiyatli javob (200) — global default:**

```json
{
  "muvaffaqiyat": true,
  "malumot": {
    "_id": "ObjectId",
    "printOneSide": 500,
    "printTwoSide": 800,
    "scanOneSide": 500,
    "scanTwoSide": 800,
    "copyOneSide": 500,
    "copyTwoSide": 800
  }
}
```

---

### 8.2 Global default narxlarni yangilash

```
PUT /api/settings
```

**Auth:** Bearer Token (faqat `superadmin`)

**Request Body (barcha maydonlar ixtiyoriy):**

```json
{
  "printOneSide": "number (>= 0)",
  "printTwoSide": "number (>= 0)",
  "scanOneSide": "number (>= 0)",
  "scanTwoSide": "number (>= 0)",
  "copyOneSide": "number (>= 0)",
  "copyTwoSide": "number (>= 0)"
}
```

---

## 9. Scan File API

**Base path:** `/scan-file`

### 9.1 Noyob kod yaratish

```
GET /scan-file/generate
```

**Auth:** Yo'q

**Tavsif:** ATM apparatida scan qilish uchun 5 xonali noyob kod yaratadi.

**Muvaffaqiyatli javob (200):**

```json
{
  "code": "48291"
}
```

---

### 9.2 Scan faylni yuklash

```
POST /scan-file/upload
```

**Auth:** Yo'q

**Header (ixtiyoriy):**
```
apparatid: APPARAT001
```

**Content-Type:** `multipart/form-data`

**Form ma'lumotlari:**
| Maydon | Tur | Tavsif |
|--------|-----|--------|
| `file` | File | Skaner qilingan fayl (max 100MB) |
| `code` | string | 5 xonali kod |
| `apparatId` | string | Apparat identifikatori (header yoki body dan) |

**Muhim:** `apparatId` headerdan (`apparatid`) yoki body dan olinadi. Dinamik Click credentials ishlashi uchun kerak.

**Muvaffaqiyatli javob (200):**

```json
{
  "message": "Fayl saqlandi",
  "data": {
    "_id": "ObjectId",
    "code": "48291",
    "file": "public/scan-file/1707820800000-123456789.pdf",
    "apparatId": "APPARAT001",
    "status": "pending"
  }
}
```

---

### 9.3 Barcha scan fayllarni olish

```
GET /scan-file/scan-files
```

**Auth:** Yo'q

**Muvaffaqiyatli javob (200):**

```json
{
  "data": [
    {
      "_id": "ObjectId",
      "code": "48291",
      "file": "public/scan-file/...",
      "status": "pending"
    }
  ]
}
```

---

## 10. Copy API

**Base path:** `/api/copy`

### 10.1 Yangi copy yaratish

```
POST /api/copy/create
```

**Auth:** Yo'q

**Request Body:**

```json
{
  "apparatId": "string (majburiy) — apparat identifikatori"
}
```

**Muvaffaqiyatli javob (200):**

```json
{
  "status": "success",
  "data": {
    "id": "ObjectId",
    "code": "73592",
    "apparatId": "APPARAT001",
    "createdAt": "2026-02-13T10:00:00.000Z"
  }
}
```

---

### 10.2 Copy ni kod orqali olish

```
GET /api/copy/get-by-code/:code
```

**Auth:** Yo'q

**Muvaffaqiyatli javob (200):**

```json
{
  "status": "success",
  "data": {
    "id": "ObjectId",
    "code": "73592",
    "apparatId": "APPARAT001",
    "status": "pending",
    "createdAt": "2026-02-13T10:00:00.000Z",
    "updatedAt": "2026-02-13T10:00:00.000Z"
  }
}
```

---

### 10.3 Barcha copy larni olish

```
GET /api/copy/all
```

**Auth:** Yo'q

**Query parametrlar:**
| Parametr | Tur | Tavsif |
|----------|-----|--------|
| `apparatId` | string | Apparat bo'yicha filtr |
| `status` | string | `pending` yoki `paid` |

**Muvaffaqiyatli javob (200):**

```json
{
  "status": "success",
  "count": 5,
  "data": ["...copy larning massivi..."]
}
```

---

### 10.4 Copy o'chirish

```
DELETE /api/copy/:id
```

**Auth:** Yo'q

---

## 11. Fayllar API

**Base path:** `/` (root)

### 11.1 Apparatga tegishli fayllarni olish

```
GET /files?apparatId=APPARAT001
```

**Auth:** Yo'q

**Query parametrlar:**
| Parametr | Tur | Tavsif |
|----------|-----|--------|
| `apparatId` | string | Majburiy — apparat identifikatori |

**Muvaffaqiyatli javob (200):**

```json
[
  {
    "_id": "ObjectId",
    "fileId": "TELEGRAM_FILE_ID",
    "fileName": "document.pdf",
    "fileType": "application/pdf",
    "uniqueCode": "A1B2C3",
    "apparatId": "APPARAT001",
    "user": {
      "username": "john_doe",
      "firstName": "John",
      "lastName": "Doe",
      "profilePic": "url"
    },
    "fileUrl": "https://...",
    "fileSize": "1.2 MB",
    "fileLink": "https://...",
    "uploadedAt": "2026-02-13T10:00:00.000Z"
  }
]
```

---

### 11.2 Barcha fayllarni olish (admin)

```
GET /admin/files
```

**Auth:** Yo'q (lekin admin panel uchun mo'ljallangan)

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": ["...barcha fayllar..."]
}
```

---

### 11.3 Barcha fayllarni o'chirish

```
DELETE /files/all-delete
```

**Auth:** Yo'q

---

### 11.4 Apparat fayllarini o'chirish

```
DELETE /files/apparat/:apparatId
```

**Auth:** Yo'q

---

### 11.5 Fayl yuklash (download)

```
GET /download/:fileId
```

**Auth:** Yo'q

**Path parametrlar:**
| Parametr | Tur | Tavsif |
|----------|-----|--------|
| `fileId` | string | Telegram file ID |

**Javob:** Fayl stream (Content-Disposition: attachment)

---

## 12. QR Code API

### 12.1 Telegram bot QR kodi

```
GET /api/vending-apparat/:apparatId/qrcode
```

**Auth:** Yo'q

**Path parametrlar:**
| Parametr | Tur | Tavsif |
|----------|-----|--------|
| `apparatId` | string | Apparat identifikatori |

**Muvaffaqiyatli javob (200):**

```json
{
  "muvaffaqiyat": true,
  "malumot": {
    "apparatId": "APPARAT001",
    "nomi": "Flash Print #1",
    "deeplink": "https://t.me/BOT_USERNAME?start=APPARAT001",
    "qrCode": "data:image/png;base64,..."
  }
}
```

---

## 13. Socket.IO Eventlar

**Server URL:** `wss://flash-print.uz` (yoki `ws://localhost:8008`)

### 13.1 Client → Server Eventlar

#### `apparatUlanish`

ATM apparat serverga ulanganida yuboriladi. Socket apparatning xonasiga (room) qo'shiladi.

```javascript
socket.emit("apparatUlanish", "APPARAT001");
```

**Server javobi:** `allFiles` eventi bilan apparatga tegishli barcha fayllar yuboriladi.

---

#### `tolovTasdiqlandi`

To'lov tasdiqlanganda (manual) yuboriladi. Statistikani yangilaydi va qog'oz sonini kamaytiradi.

```javascript
socket.emit("tolovTasdiqlandi", {
  fileId: "FILE_MONGODB_ID",
  apparatId: "APPARAT001",
  amount: 500,
  qogozSoni: 1,
});
```

**Ishlash tartibi:**

1. Statistika yangilanadi (foydalanishSoni++, daromad += amount, ishlatilganQogoz += qogozSoni)
2. Apparat `joriyQogozSoni` kamaytiriladi
3. Agar qog'oz `kamQogozChegarasi` dan kam qolsa → `qogozKam` eventi yuboriladi

---

#### `qrTolovHolati`

QR to'lov holatini apparatga yuborish.

```javascript
socket.emit("qrTolovHolati", {
  apparatId: "APPARAT001",
  fileId: "FILE_ID",
  status: "paid",
});
```

**Server javobi:** Apparat xonasiga `qrTolovYangilandi` eventi yuboriladi.

---

#### `qogozSoniYangilandi`

Qog'oz soni o'zgarganda apparat xonasiga yuborish.

```javascript
socket.emit("qogozSoniYangilandi", {
  apparatId: "APPARAT001",
  soni: 950,
});
```

**Server javobi:** Apparat xonasiga `qogozSoniYangilandi` eventi yuboriladi.

---

### 13.2 Server → Client Eventlar

#### `allFiles`

`apparatUlanish` dan keyin apparatga tegishli barcha fayllar yuboriladi.

```javascript
socket.on("allFiles", (files) => {
  // files = [{ fileId, fileName, fileType, fileUrl, fileLink, user, apparatId, ... }]
});
```

---

#### `newFile`

Yangi fayl yuklanganda faqat tegishli apparat xonasiga yuboriladi.

```javascript
socket.on("newFile", (file) => {
  // file = { fileId, fileName, fileType, fileUrl, fileLink, user, apparatId, ... }
});
```

---

#### `apparatNewFile`

Yangi fayl yuklanganda barcha clientlarga yuboriladi (admin panel uchun).

```javascript
socket.on("apparatNewFile", (data) => {
  // data = { apparatId: "APPARAT001", file: { ... } }
});
```

---

#### `qogozKam`

Qog'oz miqdori minimum chegaradan past tushganda yuboriladi (barcha clientlarga).

```javascript
socket.on("qogozKam", (data) => {
  // data = {
  //   apparatId: "APPARAT001",
  //   joriyQogozSoni: 85,
  //   xabar: "Diqqat! Flash Print #1 apparatida qog'oz kam qoldi: 85 ta"
  // }
});
```

**Trigger:** Click/Payme to'lov muvaffaqiyatli bo'lganda yoki `tolovTasdiqlandi` eventidan keyin qog'oz tekshirilganda.

---

#### `qogozYangilandi`

Admin paneldan qog'oz soni yangilanganda yuboriladi (barcha clientlarga).

```javascript
socket.on("qogozYangilandi", (data) => {
  // data = { apparatId: "APPARAT001", joriyQogozSoni: 950 }
});
```

**Trigger:** `PUT /api/vending-apparat/:id/qogoz` endpoint muvaffaqiyatli bo'lganda.

---

#### `tolovMuvaffaqiyatli`

To'lov muvaffaqiyatli amalga oshirilganda yuboriladi (barcha clientlarga).

```javascript
socket.on("tolovMuvaffaqiyatli", (data) => {
  // data = {
  //   fileId: "FILE_MONGODB_ID",
  //   apparatId: "APPARAT001",
  //   amount: 500,
  //   qogozSoni: 1,
  //   type: "uploaded_file | scanned_file | copy_file",
  //   click_trans_id: "12345678",  // faqat Click da
  //   code: "73592",               // scan/copy da
  //   paymentMethod: "payme"       // faqat Payme da
  // }
});
```

**Trigger:** Click complete yoki Payme performTransaction muvaffaqiyatli bo'lganda.

---

#### `tolovStatusYangilandi`

To'lov holati o'zgarganda yuboriladi (barcha clientlarga).

```javascript
socket.on("tolovStatusYangilandi", (data) => {
  // data = { id: "PAID_MONGODB_ID", status: "paid | pending | cancelled" }
});
```

**Trigger:** `PUT /api/paid/:id/status` endpoint muvaffaqiyatli bo'lganda.

---

#### `qrTolovYangilandi`

QR to'lov holati yangilanganda faqat tegishli apparat xonasiga yuboriladi.

```javascript
socket.on("qrTolovYangilandi", (data) => {
  // data = { fileId: "FILE_ID", status: "paid" }
});
```

---

## 14. Ma'lumotlar Modellari

### 14.1 Admin

| Maydon                            | Tur      | Tavsif                                     |
| --------------------------------- | -------- | ------------------------------------------ |
| `_id`                             | ObjectId | Avtomatik                                  |
| `username`                        | String   | Noyob, majburiy                            |
| `password`                        | String   | Shifrlangan (PBKDF2), select: false        |
| `salt`                            | String   | Parol uchun tuz, select: false             |
| `role`                            | String   | `superadmin` \| `admin` (default: `admin`) |
| `firstName`                       | String   | Majburiy                                   |
| `lastName`                        | String   | Majburiy                                   |
| `phone`                           | String   | Majburiy                                   |
| `isActive`                        | Boolean  | Default: true                              |
| `clickCredentials`                | Object   | Shifrlangan (AES-256-CBC)                  |
| `clickCredentials.secretKey`      | Object   | `{ iv, encryptedData }`                    |
| `clickCredentials.serviceId`      | Object   | `{ iv, encryptedData }`                    |
| `clickCredentials.merchantId`     | Object   | `{ iv, encryptedData }`                    |
| `clickCredentials.merchantUserId` | Object   | `{ iv, encryptedData }`                    |
| `createdAt`                       | Date     | Avtomatik (timestamps)                     |
| `updatedAt`                       | Date     | Avtomatik (timestamps)                     |

**Metodlar:**

- `setPassword(password)` — Parolni PBKDF2 bilan shifrlaydi
- `validatePassword(password)` — Parolni tekshiradi

---

### 14.2 VendingApparat

| Maydon                  | Tur              | Tavsif                                      |
| ----------------------- | ---------------- | ------------------------------------------- |
| `_id`                   | ObjectId         | Avtomatik                                   |
| `apparatId`             | String           | Noyob identifikator (masalan: `APPARAT001`) |
| `nomi`                  | String           | Apparat nomi                                |
| `joylashuv`             | String           | Joylashuv manzili                           |
| `qogozSigimi`           | Number           | Maksimal qog'oz sig'imi (default: 1000)     |
| `joriyQogozSoni`        | Number           | Hozirgi qog'oz soni (default: 0)            |
| `kamQogozChegarasi`     | Number           | Ogohlantirish chegarasi (default: 100)      |
| `oxirgiToladirishVaqti` | Date             | Oxirgi qog'oz to'ldirilgan vaqti            |
| `adminId`               | ObjectId \| null | Biriktirilgan admin (ref: Admin)            |
| `narxlar`               | Object           | Xizmat narxlari                             |
| `narxlar.printOneSide`  | Number           | 1 tomonlama chop etish (default: 500)       |
| `narxlar.printTwoSide`  | Number           | 2 tomonlama chop etish (default: 800)       |
| `narxlar.scanOneSide`   | Number           | 1 tomonlama skanerlash (default: 500)       |
| `narxlar.scanTwoSide`   | Number           | 2 tomonlama skanerlash (default: 800)       |
| `narxlar.copyOneSide`   | Number           | 1 tomonlama nusxalash (default: 500)        |
| `narxlar.copyTwoSide`   | Number           | 2 tomonlama nusxalash (default: 800)        |
| `createdAt`             | Date             | Avtomatik (timestamps)                      |
| `updatedAt`             | Date             | Avtomatik (timestamps)                      |

---

### 14.3 Paid (To'lovlar)

| Maydon               | Tur      | Tavsif                                      |
| -------------------- | -------- | ------------------------------------------- |
| `_id`                | ObjectId | Avtomatik                                   |
| `serviceData`        | Object   | Fayl/Scan/Copy ma'lumotlari (to'liq obyekt) |
| `status`             | String   | `paid` \| `pending` \| `cancelled`          |
| `amount`             | Number   | To'lov summasi                              |
| `date`               | Date     | To'lov sanasi                               |
| `clickTransactionId` | String   | Click tranzaksiya ID (faqat Click)          |
| `paymeTransactionId` | String   | Payme tranzaksiya ID (faqat Payme)          |
| `paymeCreateTime`    | Number   | Payme yaratilgan vaqt (timestamp)           |
| `paymePerformTime`   | Number   | Payme bajarilgan vaqt (timestamp)           |
| `paymeCancelTime`    | Number   | Payme bekor qilingan vaqt (timestamp)       |
| `paymeReason`        | Number   | Bekor qilish sababi                         |
| `paymentMethod`      | String   | `click` \| `payme`                          |
| `createdAt`          | Date     | Avtomatik (timestamps)                      |
| `updatedAt`          | Date     | Avtomatik (timestamps)                      |

**Indekslar:** `serviceData._id`, `status`, `paymeTransactionId` (sparse), `clickTransactionId` (sparse), `createdAt`

---

### 14.4 File (Telegram orqali yuklangan fayllar)

| Maydon            | Tur      | Tavsif                              |
| ----------------- | -------- | ----------------------------------- |
| `_id`             | ObjectId | Avtomatik                           |
| `fileId`          | String   | Telegram file ID                    |
| `fileName`        | String   | Fayl nomi                           |
| `fileType`        | String   | MIME type                           |
| `uniqueCode`      | String   | Noyob kod                           |
| `apparatId`       | String   | Apparat identifikatori              |
| `user`            | Object   | Telegram foydalanuvchi ma'lumotlari |
| `user.username`   | String   | Telegram username                   |
| `user.firstName`  | String   | Ism                                 |
| `user.lastName`   | String   | Familiya                            |
| `user.profilePic` | String   | Profil rasmi URL                    |
| `fileUrl`         | String   | Fayl URL                            |
| `fileSize`        | String   | Fayl hajmi                          |
| `uploadedAt`      | Date     | Yuklangan vaqt                      |
| `createdAt`       | Date     | Avtomatik                           |

---

### 14.5 ScanFile (Skanerlangan fayllar)

| Maydon      | Tur      | Tavsif                 |
| ----------- | -------- | ---------------------- |
| `_id`       | ObjectId | Avtomatik              |
| `code`      | String   | 5 xonali noyob kod     |
| `file`      | String   | Fayl yo'li (serverda)  |
| `apparatId` | String   | Apparat identifikatori (dinamik credentials uchun) |
| `status`    | String   | `paid` \| `pending`    |
| `createdAt` | Date     | Avtomatik (timestamps) |
| `updatedAt` | Date     | Avtomatik (timestamps) |

---

### 14.6 Copy (Nusxalash)

| Maydon      | Tur      | Tavsif                 |
| ----------- | -------- | ---------------------- |
| `_id`       | ObjectId | Avtomatik              |
| `code`      | String   | 5 xonali noyob kod     |
| `apparatId` | String   | Apparat identifikatori |
| `status`    | String   | `pending` \| `paid`    |
| `createdAt` | Date     | Avtomatik (timestamps) |
| `updatedAt` | Date     | Avtomatik (timestamps) |

**Indekslar:** `code`, `apparatId`, `status`, `createdAt`

---

### 14.7 Statistika

| Maydon             | Tur      | Tavsif                          |
| ------------------ | -------- | ------------------------------- |
| `_id`              | ObjectId | Avtomatik                       |
| `apparatId`        | String   | Apparat identifikatori          |
| `sana`             | Date     | Statistika sanasi (kun boshida) |
| `foydalanishSoni`  | Number   | Foydalanishlar soni             |
| `daromad`          | Number   | Jami daromad (so'mda)           |
| `ishlatilganQogoz` | Number   | Ishlatilgan qog'oz soni         |
| `createdAt`        | Date     | Avtomatik (timestamps)          |
| `updatedAt`        | Date     | Avtomatik (timestamps)          |

**Indekslar:** `{ apparatId: 1, sana: 1 }` (compound)

---

### 14.8 Settings (Global default narxlar)

| Maydon         | Tur      | Tavsif                 |
| -------------- | -------- | ---------------------- |
| `_id`          | ObjectId | Avtomatik              |
| `printOneSide` | Number   | Default: 500           |
| `printTwoSide` | Number   | Default: 800           |
| `scanOneSide`  | Number   | Default: 500           |
| `scanTwoSide`  | Number   | Default: 800           |
| `copyOneSide`  | Number   | Default: 500           |
| `copyTwoSide`  | Number   | Default: 800           |
| `createdAt`    | Date     | Avtomatik (timestamps) |
| `updatedAt`    | Date     | Avtomatik (timestamps) |

---

### 14.9 UserSession (Telegram foydalanuvchi sessiyasi)

| Maydon       | Tur      | Tavsif                   |
| ------------ | -------- | ------------------------ |
| `_id`        | ObjectId | Avtomatik                |
| `telegramId` | Number   | Telegram user ID (noyob) |
| `apparatId`  | String   | Ulanilgan apparat ID     |
| `firstName`  | String   | Telegram ism             |
| `username`   | String   | Telegram username        |
| `createdAt`  | Date     | Avtomatik (timestamps)   |
| `updatedAt`  | Date     | Avtomatik (timestamps)   |

---

## 15. Xatolik Kodlari

### REST API xatoliklari

| HTTP Kodi | Tavsif                                   |
| --------- | ---------------------------------------- |
| `400`     | Noto'g'ri so'rov (validatsiya xatoligi)  |
| `401`     | Avtorizatsiya zarur yoki token noto'g'ri |
| `403`     | Ruxsat yo'q (role yetarli emas)          |
| `404`     | Ma'lumot topilmadi                       |
| `500`     | Server xatoligi                          |

**Javob formati:**

```json
{
  "muvaffaqiyat": false,
  "xabar": "Xatolik tavsifi"
}
```

---

### Click xatolik kodlari

| Kod  | Nomi                | Tavsif                     |
| ---- | ------------------- | -------------------------- |
| `0`  | Success             | Muvaffaqiyatli             |
| `-1` | SignFailed          | Imzo noto'g'ri             |
| `-2` | InvalidAmount       | Summa noto'g'ri            |
| `-3` | ActionNotFound      | Amal topilmadi             |
| `-4` | AlreadyPaid         | Allaqachon to'langan       |
| `-5` | UserNotFound        | Buyurtma topilmadi         |
| `-6` | TransactionNotFound | Tranzaksiya topilmadi      |
| `-7` | BadRequest          | Noto'g'ri so'rov           |
| `-8` | TransactionCanceled | Tranzaksiya bekor qilingan |

---

### Payme xatolik kodlari

| Kod      | Nomi                 | Tavsif                  |
| -------- | -------------------- | ----------------------- |
| `-31001` | InvalidAmount        | Summa noto'g'ri         |
| `-31003` | TransactionNotFound  | Tranzaksiya topilmadi   |
| `-31008` | CantDoOperation      | Amal bajarib bo'lmaydi  |
| `-31050` | InvalidAccount       | Hisob noto'g'ri         |
| `-31060` | AlreadyDone          | Allaqachon bajarilgan   |
| `-32504` | InvalidAuthorization | Avtorizatsiya noto'g'ri |

---

## Route registratsiya xaritasi

| Express path                             | Router fayli               | Tavsif                 |
| ---------------------------------------- | -------------------------- | ---------------------- |
| `/api/admin`                             | `admin.routes.js`          | Auth + Admin CRUD      |
| `/api/vending-apparat`                   | `vendingApparat.routes.js` | Apparat CRUD           |
| `/api/click`                             | `click.routes.js`          | Click to'lov           |
| `/api/payme`                             | `payme.routes.js`          | Payme to'lov           |
| `/api/v1/payme`                          | `payme.routes.js`          | Payme (versiya 1)      |
| `/api/paid`                              | `paid.routes.js`           | To'lovlar              |
| `/api/statistika`                        | `statistika.routes.js`     | Statistika             |
| `/api/settings`                          | `settings.routes.js`       | Sozlamalar             |
| `/api/copy`                              | `copy.routes.js`           | Copy xizmati           |
| `/scan-file`                             | `scanFile.routes.js`       | Scan xizmati           |
| `/files`                                 | `index.js`                 | Fayllar (inline)       |
| `/admin/files`                           | `index.js`                 | Admin fayllar (inline) |
| `/download/:fileId`                      | `index.js`                 | Fayl yuklash (inline)  |
| `/api/vending-apparat/:apparatId/qrcode` | `index.js`                 | QR kod (inline)        |

---

## Shifrlash

### AES-256-CBC

Admin Click credentials AES-256-CBC algoritmi bilan shifrlanadi.

**Shifrlangan formatda saqlanadi:**

```json
{
  "iv": "hex string (initialization vector)",
  "encryptedData": "hex string (shifrlangan ma'lumot)"
}
```

**Kalit:** `ENCRYPTION_KEY` environment variable (32 byte). Agar mavjud bo'lmasa, lazy loading bilan hosil qilinadi.

**Fayl:** `nodeCopy/utils/encryption.js`

---

## Environment o'zgaruvchilari

| Nomi                | Tavsif                             |
| ------------------- | ---------------------------------- |
| `MONGO_URI`         | MongoDB connection string          |
| `PORT`              | Server porti (default: 8008)       |
| `JWT_SECRET`        | JWT token kaliti                   |
| `BOT_TOKEN`         | Telegram bot tokeni                |
| `ENCRYPTION_KEY`    | AES-256 shifrlash kaliti (32 byte) |
| `CLICK_SECRET_KEY`  | Click fallback secret key          |
| `CLICK_SERVICE_ID`  | Click fallback service ID          |
| `CLICK_MERCHANT_ID` | Click fallback merchant ID         |
| `PAYME_MERCHANT_ID` | Payme merchant ID (24 belgi)       |
| `PAYME_SECRET_KEY`  | Payme production kaliti            |
| `PAYME_TEST_KEY`    | Payme test kaliti                  |

#EndpointHolat1POST /api/click/get-click-link✅ Print to'lov — ishlayapti2POST /api/click/get-scan-link✅ Scan to'lov3POST /api/click/get-copy-link✅ Copy to'lov4POST /api/click/check-payment-status✅ To'lov tekshirish5GET /api/settings✅ Narxlar6GET /api/vending-apparat/:apparatId/qogoz-qoldiq✅ Qog'oz7GET /files?apparatId=✅ Telegram fayllar8GET /download/:fileId✅ Fayl yuklash9POST /api/copy/create✅ Copy yaratish10GET /api/copy/get-by-code/:code✅ Copy tekshirish11POST /scan-file/upload✅ Scan yuklash12POST /api/payme/get-payme-link✅ Payme fayl13POST /api/payme/get-scan-payme-link✅ Payme scan
