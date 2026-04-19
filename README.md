# Scholar Awards Backend

## Quick start
```bash
npm install
cp .env.example .env
# add your MongoDB URI in .env
npm run seed
npm run dev
```

## Temporary super admin login
- username: `sanju`
- password: `sanju`

## Scope included
This backend is a **runnable scaffold** for:
- role-wise access
- students and category evaluation
- stage assignments
- guest replacement
- donations
- notifications
- automation rule storage
- certificate template storage
- Socket.IO live events

## Not fully production-complete yet
The following are scaffolded conceptually but not fully implemented end-to-end:
- real OCR / Google Drive pipeline
- actual WhatsApp Cloud API send
- PDF certificate generation
- push notification subscription handling
- advanced offline queue conflict resolution
