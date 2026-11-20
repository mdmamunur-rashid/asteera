# 🏭 আস্তিরা প্রোডাকশন অটোমেশন — ব্যবহারকারীর গাইড (বাংলা)

এই ডকুমেন্টে পুরো অটোমেশন সিস্টেমটি সহজ বাংলায় ব্যাখ্যা করা হলো — কোন শিট
কী করে, কোন তথ্য আপনি নিজে লিখবেন, আর কোনটা সফটওয়্যার নিজে থেকে বসিয়ে দেবে।

---

## ১. সিস্টেমটি আসলে কী করে?

আপনি শুধু **মূল তথ্য** (raw data) ইনপুট দেবেন — যেমন: নতুন SKU, কত পিস প্রিন্টে
গেল, কোন সাপ্লায়ার, কাঁচামাল কেনা, খরচ। বাকি সব হিসাব — মোট কাপড়, প্রিন্ট পেমেন্ট,
সেলাই খরচ, স্টক, সাপ্লায়ারের বকেয়া, আর Dashboard — সফটওয়্যার **নিজে থেকে**
হিসাব করে বসিয়ে দেবে।

মোটামুটি **৮৫–৯০% কাজ অটোমেটিক**। মানুষকে শুধু বাস্তব ঘটনাগুলো টাইপ করতে হবে।

---

## ২. শিটগুলো কীভাবে একে অপরের সাথে যুক্ত

```
আপনি লিখবেন                সফটওয়্যার হিসাব করবে              রেজাল্ট
──────────────              ───────────────────              ──────────
Supplier Name & ID  ┐
SKU Fabric Need     ├──►  Production Log  ──►  Payment Ledger ──┐
Purchase Raw Material┘          │                               ├──► Dashboard
Daily Expense ──────────        │            Material Stock ◄───┘
                                └──────────►  Invoice
```

- **SKU Fabric Need** → প্রতিটি SKU-এর কাপড়ের পরিমাণ, সেলাই খরচ, প্রিন্ট রেট।
- **Supplier Name & ID** → সাপ্লায়ারের নাম, ধরন (Printing/Sewing/Embroidery), ID।
- **Purchase Raw Material** → কোন কাপড় কত কেনা হলো।
- **Production Log** → মূল কাজের খাতা (প্রিন্টিং + সেলাই)।
- **Material Stock** → কাপড়ের স্টক (কেনা − ব্যবহৃত = বাকি)।
- **Payment Ledger** → সাপ্লায়ারকে কত দিতে হবে, কত দেওয়া হয়েছে।
- **Dashboard** → সব মিলিয়ে এক নজরে রিপোর্ট।

---

## ৩. কোনটা আপনি লিখবেন, কোনটা অটো

### Production Log — প্রিন্টিং অংশ
| কলাম | কে বসাবে | কীভাবে |
|---|---|---|
| Order Date | 🤖 অটো | আজকের তারিখ |
| Item Name | 🤖 অটো | আগের একই SKU-ওয়ালা সারি থেকে |
| Fabric Name | 🤖 অটো | আগের একই SKU-ওয়ালা সারি থেকে |
| **SKU** | ✍️ আপনি | নিজে টাইপ করবেন |
| **Qty to Print** | ✍️ আপনি | কত পিস |
| Fabric per Unit (Goj) | 🤖 অটো | SKU Fabric Need শিটের B কলাম থেকে |
| Total Fabric (Goj) | 🤖 অটো | Qty × Fabric per Unit |
| Work Type | 🤖 অটো | "Print" |
| Work Status | 🤖 অটো | শুরুতে "Processing" |
| **Received QTY** | ✍️ আপনি | কত পিস ফেরত এলো |
| **Received Date** | ✍️ আপনি | কবে ফেরত এলো |
| Print Payment (BDT) | 🤖 অটো | Total Fabric × ৩৫ টাকা/গজ |
| Supplier Name | 🤖 অটো | Supplier ID দিয়ে মিলিয়ে |
| **Supplier ID** | ✍️ আপনি | কোন সাপ্লায়ার |
| Payment Date / Status | ✍️ আপনি | নিজে |

### Production Log — সেলাই অংশ
| কলাম | কে বসাবে | কীভাবে |
|---|---|---|
| **SKU, Qty to Sew** | ✍️ আপনি | নিজে |
| Sewn Unit Cost | 🤖 অটো | SKU Fabric Need-এর Selai cost (D কলাম) |
| Sewn Total Cost | 🤖 অটো | Qty × Unit Cost |
| Work Type | 🤖 অটো | "Sewing" |
| Work Status | 🤖 অটো | শুরুতে "Processing" |
| Supplier Name | 🤖 অটো | Supplier ID দিয়ে |
| **Received QTY, Supplier ID** | ✍️ আপনি | নিজে |

> 💡 **নোট:** কোনো নতুন SKU প্রথমবার লিখলে Item Name ও Fabric Name ফাঁকা
> থাকবে — কারণ আগে ওই SKU কোথাও নেই। প্রথমবার নিজে লিখে দিন; এরপর ওই SKU
> যতবার আসবে, নিজে থেকে বসে যাবে।

---

## ৪. প্রতিটি অটোমেশনের ব্যাখ্যা

### 🧮 মডিউল ২ — Production খরচ হিসাব (`Production.gs`)
SKU লিখলেই: কাপড়/ইউনিট, মোট কাপড়, প্রিন্ট পেমেন্ট, সেলাই খরচ, সাপ্লায়ারের নাম —
সব বসে যায়। Work Status "Done" করলে Received Date নিজে থেকে বসে।

**উদাহরণ:** SKU 70, Qty 6, কাপড়/ইউনিট 3.25 →
মোট কাপড় = 6 × 3.25 = **19.5 গজ**, প্রিন্ট পেমেন্ট = 19.5 × 35 = **৬৮৩ টাকা**।

### 📦 মডিউল ১ — Material Stock (`MaterialStock.gs`)
- Purchase Vol = Purchase Raw Material থেকে ওই কাপড়ের মোট কেনা।
- Used Vol = Production Log-এ ওই কাপড়ের মোট ব্যবহৃত (প্রিন্টিং-এর Total Fabric)।
- Remaining = কেনা − ব্যবহৃত।
- স্টক **৫০ গজ-এর নিচে** নামলে ঘরটি **লাল** হয়ে যাবে (সতর্কতা)।

### 💰 মডিউল ৩ — Payment Ledger (`PaymentLedger.gs`)
- Balance = Total Due − Amount Paid।
- Payment Status নিজে থেকে: **Unpaid / Partially Paid / Paid**।

### 🔗 মডিউল ৪ — Production → Ledger সিংক (`LedgerSync.gs`)
কোনো কাজ **"Done"** হলে, সফটওয়্যার নিজে থেকে Payment Ledger-এ একটি সারি তৈরি করে:
- **প্রিন্টিং Done** → প্রিন্টিং সাপ্লায়ারের বকেয়া (Print Payment)।
- **সেলাই Done** → সেলাই সাপ্লায়ারের বকেয়া (Sewn Total Cost)।

> এটি **নিরাপদ**: একই কাজ বারবার সিংক করলেও **ডুপ্লিকেট সারি হবে না**, আর আপনি
> যা **Amount Paid** লিখেছেন তা মুছবে না।

### 📊 মডিউল ৫ — Dashboard (`Dashboard.gs`)
এক নজরে সব হিসাব — মোট ব্যাচ, প্রিন্টে পাঠানো, সেলাই হওয়া, মোট বকেয়া, পরিশোধ,
স্টেজ-ভিত্তিক অগ্রগতি (% Done), আর সাপ্লায়ার-ভিত্তিক বকেয়ার টেবিল।
**Complete সংখ্যা গণনা হয় Received QTY থেকে** (অর্ডার সংখ্যা থেকে নয়)।

---

## ৫. কীভাবে ব্যবহার করবেন (মেনু)

শিট খুললে উপরে **⚙️ Asteera Automation** নামে একটি মেনু আসবে:

| মেনু | কাজ |
|---|---|
| 🔄 Recalculate Everything | সব কিছু নতুন করে হিসাব করে |
| 🧮 Production Costs | শুধু Production Log হিসাব |
| 🔗 Sync Production → Ledger | কমপ্লিট কাজ থেকে বকেয়া তৈরি |
| 📦 Material Stock | স্টক হিসাব |
| 💰 Payment Ledger | ব্যালেন্স ও স্ট্যাটাস |
| 📊 Refresh Dashboard | Dashboard আপডেট |

এছাড়া আপনি যখন কোনো ঘরে টাইপ করেন, সিস্টেম **নিজে থেকেই** (onEdit) সম্পর্কিত
হিসাব আপডেট করে দেয় — আলাদা করে মেনুতে ক্লিক করতে হয় না।

---

## ৬. সেটিংস / ডিফল্ট মান (`Config.gs` ফাইলে)

| সেটিং | ডিফল্ট | মানে |
|---|---|---|
| Print Rate | **৩৫ টাকা/গজ** | প্রিন্টের রেট |
| Selai Cost | **১০০ টাকা/পিস** | সেলাইয়ের রেট |
| Low Stock | **৫০ গজ** | এর নিচে নামলে লাল সতর্কতা |

> এই মানগুলো `Config.gs`-এ বদলালেই সব হিসাবে নতুন মান কাজ করবে।

---

## ৭. গুরুত্বপূর্ণ নোট

1. **Work Status:** সিস্টেম "Done", "Processing", "Completed", "Pending",
   "On Hold" — সব বোঝে। "Done" মানে কাজ শেষ (তখনই বকেয়া তৈরি হয়)।
2. **Embroidery = 0:** এখনকার Production Log-এ শুধু Printing + Sewing আছে,
   Embroidery নেই — তাই Dashboard-এ Embroidery-এর ঘরগুলো 0 থাকবে।
3. **সারি মাঝখানে যোগ করবেন না:** Production Log-এ নিচ থেকে নতুন সারি যোগ করুন।
   মাঝখানে সারি ঢোকালে Ledger-এর হিসাবে সমস্যা হতে পারে।
4. **প্রথমবার চালু করতে:** শিটের ভেতর থেকে Extensions → Apps Script খুলে সব
   `.gs` ফাইল পেস্ট করুন → শিট রিলোড করুন → একবার **Recalculate Everything**
   চালান (অনুমতি চাইলে Allow দিন)।

---

## ৮. ফাইল তালিকা (টেকনিক্যাল রেফারেন্স)
| ফাইল | কাজ |
|---|---|
| `Config.gs` | সব সেটিং, শিট ও কলামের ঠিকানা |
| `Utils.gs` | সাধারণ হেল্পার ফাংশন |
| `Production.gs` | প্রোডাকশন খরচ হিসাব |
| `MaterialStock.gs` | স্টক হিসাব |
| `PaymentLedger.gs` | ব্যালেন্স ও স্ট্যাটাস |
| `LedgerSync.gs` | কমপ্লিট কাজ → বকেয়া |
| `Dashboard.gs` | Dashboard রিপোর্ট |
| `Menu.gs` | মেনু |
| `Triggers.gs` | অটো-আপডেট (onEdit) |
