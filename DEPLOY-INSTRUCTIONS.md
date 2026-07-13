# NeuroCode — Deploy təlimatı (GitHub → Vercel)

## Bu ZIP-in içindəkilər
- index.html          → əsas sayt (neurocode.html-in eyni surəti; Vercel/Pages avtomatik açır)
- neurocode.html      → eyni fayl (istəsəniz birbaşa bu adla da işlədə bilərsiniz)
- api/                → 8 backend endpoint (Vercel serverless funksiyaları)
- package.json        → backend asılılıqları (firebase-admin, googleapis)
- README-SETUP.md     → ətraflı env və Firebase quraşdırma
- DEPLOY-INSTRUCTIONS.md → bu fayl

## GitHub-a yükləmə (mövcud repo-ya)
Bu ZIP-i açın və İÇİNDƏKİ faylları repo-nun KÖKÜNƏ yükləyin:
- index.html (və ya neurocode.html) → repo kökünə
- api/ qovluğunu → repo kökünə (mövcud api/_router.js və api/ai.js SAXLANIR,
  bunlara toxunulmur — yalnız yeni fayllar əlavə olunur)
- package.json → repo kökünə (mövcud varsa, dependencies-i birləşdirin)

## Vercel Environment Variables (Settings → Environment Variables)
- FIREBASE_SERVICE_ACCOUNT = Firebase Admin SDK JSON (tam məzmun)
- OWNER_EMAIL              = firuzemurselova920@gmail.com
- (ödəniş üçün sonra) PADDLE_WEBHOOK_SECRET, PLAY_SERVICE_ACCOUNT
Sonra Redeploy.

## Firebase (Console)
- Authentication → Email/Password: Enable
- Firestore Database: Create (activity/entitlements/founding_members kolleksiyaları
  avtomatik yaranır)
- Web API Key artıq /api/config vasitəsilə avtomatik yüklənir.
