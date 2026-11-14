# Firebase setup: Blaze, budget alert, plan PDFs, invitation emails

Project: **estimator-dd6e6**. Do these once, in this order.

## 1. Blaze plan
Firebase console → the project → bottom left **Spark · Upgrade** → **Blaze** → link a billing account.
Cloud Storage and extensions need it. Small teams usually stay inside the free quotas.

## 2. Budget alert
Google Cloud console → **Billing → Budgets & alerts → Create budget**
- Scope: project `estimator-dd6e6`
- Amount: e.g. **$25 / month**
- Alerts at **50 %, 90 %, 100 %** by email to the billing admins

An alert warns; it does not stop the spending.

## 3. Cloud Storage (plan PDFs for the whole team)
1. Firebase console → **Build → Storage → Get started** → production mode, the same location as Firestore.
2. Check `.env.local`: `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` must be the bucket shown there
   (new projects: `estimator-dd6e6.firebasestorage.app`).
3. Rules: `firebase deploy --only storage` (file `storage.rules`: company members read, estimators upload, PDFs up to 50 MB).
4. Let the browser download the PDFs (CORS). Add your real domain to `cors.json` first, then:
   `gsutil cors set cors.json gs://estimator-dd6e6.firebasestorage.app`
   (Google Cloud SDK; or the Cloud Shell in the console).

PDFs attached before this stay only on the computer that attached them: attach them again once to share them.

## 4. Invitation emails (Trigger Email extension)
1. Firebase console → **Extensions → Trigger Email from Firestore → Install**.
2. Settings:
   - Email documents collection: **mail**
   - SMTP connection URI, for example
     - Gmail (with 2-step verification and an *app password*): `smtps://you@gmail.com:APP_PASSWORD@smtp.gmail.com:465`
     - SendGrid: `smtps://apikey:SG.xxxx@smtp.sendgrid.net:465`
   - Default FROM: e.g. `Inventory Estimator <you@gmail.com>`
3. Rules: `firebase deploy --only firestore:rules` (only an Admin can queue an invitation, to an email the company invited).

Until the extension is installed, inviting still works: the email just is not sent, and the "Email the invitation" button opens your own mail app as before.

## Deploy everything
`firebase deploy --only firestore:rules,firestore:indexes,storage`
