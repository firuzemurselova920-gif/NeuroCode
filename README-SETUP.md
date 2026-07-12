# NeuroCode Monetizasiya — Quraşdırma Təlimatı

## A. Firebase (real hesablar)
1. console.firebase.google.com → mövcud "neurocode-class" layihəsi →
   Authentication → Sign-in method → **Email/Password: Enable**
2. Project Settings → Web API Key-i kopyalayın
3. Project Settings → Service Accounts → **Generate new private key** (JSON saxlayın)

## B. Backend (bu paket, mövcud Vercel layihənizə)
1. Bu `api/` fayllarını mövcud Vercel layihənizin (neuro-code-rs1q) `api/` qovluğuna əlavə edin
2. `package.json` dependencies-i birləşdirin → deploy
3. Vercel → Settings → Environment Variables:
   - `FIREBASE_SERVICE_ACCOUNT` = A3-dəki JSON-un TAM məzmunu
   - `PLAY_SERVICE_ACCOUNT`     = D2-dəki JSON-un TAM məzmunu

## C. Saytın aktivləşdirilməsi (neurocode.html)
Runtime Configuration blokunda:
- `NC_PROD.FIREBASE_API_KEY` = A2-dəki açar
- `NC_PROD.AUTH_ENABLED` = `true`
(false qaldıqca sayt indiki beta rejimində işləyir — heç nə dəyişmir)

## D. Google Play Billing
1. Play Console → Monetize → Subscriptions → yaradın:
   `neurocode_go_monthly`, `neurocode_premium_monthly`, `neurocode_premium_annual` (ID-lər dəqiq belə)
2. Play Console → Setup → API access → Google Cloud service account yaradın,
   **Financial data** icazəsi verin → JSON key (B3-dəki env üçün)
3. Android layihəsində billing plugin:
   `npm install cordova-plugin-purchase` → `npx cap sync android`
4. AAB build → Internal testing → test alışı → axın yoxlanışı

## Axın (uydurma uğur yoxdur)
Alış → Play token → `/api/verify-purchase` → Google Play Developer API
REAL yoxlama → Firestore `entitlements/{uid}` → `/api/entitlement` →
tətbiqdə plan. Server əlçatmazsa plan YALNIZ aşağı enir, heç vaxt qalxmır.

## Firestore qaydası (Console → Firestore → Rules)
`entitlements/{uid}`: client oxuya bilməz/yaza bilməz (yalnız Admin SDK) —
defolt kilidli qaydalar kifayətdir; xüsusi qayda əlavə etməyin.

## E. Founding 100
Admin siyahısı üçün heç bir açar LAZIM DEYİL — giriş yalnız OWNER_EMAIL
hesabının Firebase tokeni ilədir (bax: H). Sayt daxilində 🛡️ Admin Panel →
Founding 100 tabı.
3. Qayda: ilk 100 üzvə avtomatik ömürlük `premium` entitlement yazılır
   (founding.js-də bir sətirlə dəyişilə bilər). 100 dolduqda yeni yer verilmir,
   landing bölməsi avtomatik "TAMAMLANDI" göstərir.

## F. Web ödənişləri — Paddle (yeni)
1. Paddle Dashboard → Developer Tools → Notifications → **New destination**:
   URL = https://neuro-code-rs1q.vercel.app/api/paddle-webhook
   Events: transaction.completed, subscription.activated, subscription.updated,
           subscription.canceled, subscription.past_due
2. Yaradılan **secret key**-i Vercel env-ə yazın: `PADDLE_WEBHOOK_SECRET`
3. HTML konfiq blokunda NC_PADDLE: clientToken + 3 price ID doldurun
   (bunlar olmadan web-də plan kliki yalnız "tezliklə" bildirişi göstərir —
   saxta ödəniş forması YOXDUR)
Axın: Paddle overlay (kartı yalnız Paddle görür) → webhook imza-yoxlaması →
Firestore entitlement → sayt serverdən oxuyub Premium-u aktivləşdirir.

## G. Payriff (gələcək — struktur hazırdır)
Aktivləşdirmə günü: Vercel env `PAYRIFF_SECRET_KEY` + `PAYRIFF_MERCHANT_ID`,
HTML-də NC_PAYRIFF.enabled=true + merchantId. Secret heç vaxt client-ə düşmür;
kartı yalnız Payriff-in rəsmi səhifəsi toplayır; Premium yalnız callback
təsdiqi ilə (entitlement) aktivləşir. O günə qədər 501 qaytarır — saxta ödəniş yoxdur.

## H. "Qeydiyyatdan Keçənlər" — YALNIZ OWNER (superadmin)
1. Vercel env: `OWNER_EMAIL` = yalnız sizin e-mail (tək dəyər)
2. HTML konfiqində: `NC_PROD.OWNER_EMAIL: 'sizin e-mail'`
Nəticə: siyahını (ad/e-mail/tarix/status/plan) YALNIZ bu e-maillə Firebase-ə
daxil olmuş hesab ala bilər — server idToken-i doğrulayır və e-maili dəqiq
müqayisə edir. Paylaşılan açar/parol yolu tamamilə silinib; müəllim, şagird,
valideyn, Premium — heç kim nə düyməni, nə səhifəni, nə datanı görür.
(Köhnə FOUNDING_ADMIN_KEY env-i artıq istifadə olunmur — silə bilərsiniz.)

## I. Admin Panel — bütün istifadəçilər (yeni)
Endpoint-lər: api/admin-users.js (owner-only siyahı/statistika/detal),
api/track.js (aktivlik-tracking). Heç bir əlavə env LAZIM DEYİL —
mövcud FIREBASE_SERVICE_ACCOUNT + OWNER_EMAIL kifayətdir.
Firestore-da yeni "activity" kolleksiyası avtomatik yaranacaq.
Firestore Rules-a əlavə heç nə lazım deyil (default deny; yazılar Admin SDK ilə).
Məlumat mənbələri: Firebase Auth (e-mail, qeydiyyat, son giriş) +
entitlements (plan) + founding_members (№/ad) + activity (testlər, suallar,
düz/səhv, mərkəzlər, Error DNA). QEYD: tracking qoşulmamışdan ƏVVƏLKİ
fəaliyyət yalnız istifadəçi cihazında idi — serverdə yoxdur və panel bunu
dürüst şəkildə "—" göstərir.
