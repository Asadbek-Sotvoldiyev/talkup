# TalkUp / online-chat loyihasi tahlili

## Qisqa xulosa

Bu loyiha Django 6.0 asosida yozilgan real-time private chat ilovasi. Asosiy mahsulot nomi template va UI matnlarida `TalkUp` sifatida ishlatilgan. Foydalanuvchi Google OAuth orqali tizimga kiradi, boshqa foydalanuvchilarni qidiradi, shaxsiy chat ochadi va WebSocket orqali xabar almashadi.

Loyihada Django Channels, Daphne va Redis channel layer ishlatiladi. Xabar matni bazaga Fernet orqali shifrlab saqlanadi. Frontend klassik Django template, Tailwind CDN, Lucide ikonlari va vanilla JavaScript bilan qurilgan.

## Texnologiyalar

- Backend: Django 6.0, Django class-based views, Django ORM.
- Real-time: Django Channels 4, Daphne, `channels_redis`, Redis.
- Auth: `django-allauth`, Google OAuth provider.
- Static serving: WhiteNoise, `CompressedManifestStaticFilesStorage`.
- Database: SQLite (`db.sqlite3`) sozlangan, `requirements.txt` ichida PostgreSQL uchun `psycopg2-binary` ham bor.
- Media: Django `FileSystemStorage`, avatar rasmlari `media/images/<user_id>/...` ichida saqlanadi.
- Frontend: Django templates, Tailwind CDN, Lucide CDN, CropperJS CDN, vanilla JS.
- Kriptografiya: `cryptography.Fernet`.

## Kataloglar va muhim fayllar

- `config/settings.py`: Django sozlamalari, Channels, static/media, allauth va security sozlamalari.
- `config/asgi.py`: HTTP va WebSocket routingni birlashtiradi.
- `config/urls.py`: admin, allauth, login/terms va core URLlarini ulaydi.
- `core/models.py`: custom `User` va `Message` modellari.
- `core/views.py`: home, login, terms, chat list, search, profile update, chat delete va verify viewlari.
- `core/consumers/message.py`: private chat WebSocket consumeri.
- `core/routing.py`: WebSocket URL patternlari.
- `core/utils.py`: xabar shifrlash/deshifrlash va avatar path helperi.
- `core/forms.py`: profil update formasi.
- `templates/`: sahifalar HTML template fayllari.
- `static/js/chat-room.js`: chat xonasi frontend logikasi.
- `static/js/chat-list.js`: chat ro‘yxati, profil modal, qidiruv, avatar crop logikasi.
- `static/css/`: custom chat CSS fayllari.
- `staticfiles/`: collectstatic natijasi; runtime/source kod emas, build artefakt sifatida qaraladi.
- `requirements.txt`: Python dependencylar ro‘yxati.

## Ma'lumotlar modeli

### `User`

`core.models.User` Django `AbstractUser`dan meros oladi.

Qo‘shimcha maydonlar:

- `image`: profil rasmi, ixtiyoriy.
- `is_verified`: foydalanuvchi tasdiqlanganligini bildiradi.

`AUTH_USER_MODEL = "core.User"` ishlatilgani sababli migratsiyalarda va tashqi applarda shu custom user model asosiy model hisoblanadi.

### `Message`

`Message` private chat xabarini ifodalaydi.

Maydonlar:

- `sender`: xabar yuboruvchi user.
- `receiver`: xabar qabul qiluvchi user.
- `reply_to`: boshqa xabarga javob, nullable.
- `text`: xabar matni; kod bo‘yicha Fernet bilan shifrlangan string saqlanadi.
- `is_read`: o‘qilgan holati.
- `is_edited`: tahrirlangan holati.
- `edited_at`: tahrir vaqti.
- `created_at`: yaratilgan vaqt.

Ordering `created_at` bo‘yicha o‘sish tartibida.

## Auth va foydalanuvchi oqimi

Asosiy login oqimi Google OAuth orqali ishlaydi. `templates/registration/login.html` Google login formani `/accounts/google/login/` manziliga yuboradi. `django-allauth` URLlari `config/urls.py` orqali `/accounts/` ostida ulanadi.

Autentifikatsiyadan keyin foydalanuvchi `/` emas, `LOGIN_REDIRECT_URL = "/"` bo‘yicha homega qaytishi mumkin, lekin authenticated foydalanuvchilar uchun `HomePageView` `LoginNoRequiredMixin` orqali `chat-list`ga redirect qiladi. Natijada tizimga kirgan foydalanuvchi chat ro‘yxatiga yo‘naltiriladi.

Logout `/accounts/logout/` allauth endpointi orqali ishlaydi va `LOGOUT_REDIRECT_URL = "/accounts/login/"`.

## HTTP viewlar

- `HomePageView`: landing page. Faqat anonymous foydalanuvchilar uchun; authenticated user `chat-list`ga ketadi.
- `LoginPageView`: Google login sahifasi. Authenticated user `chat-list`ga ketadi.
- `TermsPageView`: foydalanish shartlari sahifasi.
- `ChatListView`: userning mavjud suhbatlarini ko‘rsatadi. Faqat kamida bitta xabari bor suhbatlar ro‘yxatga chiqadi.
- `SearchUsersView`: `q` query param bo‘yicha username qidiradi. Kamida 2 ta belgi talab qiladi.
- `PrivateChatView`: bitta receiver bilan chat xonasini ochadi. O‘zi bilan chat ochishga ruxsat bermaydi.
- `ProfileUpdateView`: avatar, username, first name, last name yangilaydi.
- `ChatDeleteView`: ikki user orasidagi barcha xabarlarni o‘chiradi.
- `ToggleVerifyView`: staff user uchun boshqa userning `is_verified` holatini toggle qiladi.

## WebSocket chat oqimi

WebSocket endpoint:

```text
/ws/private/<receiver_id>/
```

Consumer: `core.consumers.message.MessageConsumer`.

Ulanish bosqichlari:

1. Anonymous user bo‘lsa, ulanish yopiladi.
2. Receiver ID tekshiriladi; o‘zi bilan chat qilish bloklanadi.
3. Receiver mavjudligi tekshiriladi.
4. Ikkala user ID tartiblanib `chat_key = pm_<a>_<b>` hosil qilinadi.
5. Channel group nomi `chat_pm_<a>_<b>` bo‘ladi.
6. Oxirgi 50 ta xabar frontendga `history: true` payload bilan yuboriladi.
7. Cache orqali userning active va online holati belgilanadi.
8. Receiverdan kelgan o‘qilmagan xabarlar o‘qilgan deb belgilanadi.
9. Presence eventi groupga yuboriladi.

Qo‘llab-quvvatlanadigan WebSocket xabar turlari:

- Oddiy xabar yuborish: `{ "message": "...", "reply_to_id": null }`
- Typing indicator: `{ "typing": true }`
- Ping: `{ "ping": true }`
- Xabarni o‘chirish: `{ "delete": true, "message_id": 123 }`
- Xabarni tahrirlash: `{ "edit": true, "message_id": 123, "message": "..." }`
- Eski xabarlarni yuklash: `{ "type": "load_older", "before_id": 123, "limit": 50 }`

Consumer xabar uzunligini 4096 belgigacha kesadi. Xabarni faqat yuborgan user tahrirlashi yoki o‘chirishi mumkin.

## Xabar shifrlash

`core/utils.py` ichida global Fernet obyekt yaratiladi:

```python
fernet = Fernet(settings.MESSAGE_ENCRYPTION_KEY)
```

Yangi xabar saqlanganda:

1. Plain text frontenddan keladi.
2. `encrypt_text()` orqali shifrlanadi.
3. Shifrlangan token `Message.text`ga saqlanadi.
4. Frontendga qaytarishda `safe_decrypt()` orqali ochib yuboriladi.

Muhim cheklov: `MESSAGE_ENCRYPTION_KEY` kod ichida hardcoded. Bu production uchun xavfli. Key env variable orqali berilishi kerak, aks holda repo sizib chiqsa eski va yangi xabarlar xavf ostida qoladi.

## Online status va o‘qilganlik

Presence va read receipt hozir cache orqali ishlaydi.

- `online:<user_id>`: user online ko‘rinishi uchun.
- `active:<chat_key>:<user_id>`: user ayni chat oynasida ekanligini bildirish uchun.
- `last_seen:<user_id>`: disconnect vaqtida saqlanadi, lekin hozir UI da aniq ishlatilmayapti.

`CHANNEL_LAYERS` Redisga bog‘langan, lekin `CACHES` local memory cache. Bu bitta processda ishlaydi, lekin bir nechta worker/server bo‘lsa online status va active chat holati processlar orasida sinxron bo‘lmaydi. Productionda cache uchun ham Redis ishlatish maqsadga muvofiq.

## Frontend funksiyalari

### Chat ro‘yxati

`static/js/chat-list.js` quyidagilarni bajaradi:

- Search inputga debounce bilan `/search/?q=...` so‘rov yuboradi.
- Natijalarni dropdown sifatida chiqaradi.
- Profil modalini ochadi/yopadi.
- Avatar tanlashda CropperJS orqali 1:1 rasm crop qiladi va PNG sifatida formaga joylaydi.
- Chat row context menu orqali chatni ochish, o‘chirish va staff uchun verify toggle qilish imkonini beradi.
- Mobile long-press context menu qo‘llab-quvvatlangan.

### Chat xonasi

`static/js/chat-room.js` quyidagilarni bajaradi:

- WebSocketga ulanadi va reconnect paytida pending xabarni saqlaydi.
- Oxirgi 50 xabarni render qiladi.
- Scroll yuqorisiga yetganda eski xabarlarni yuklaydi.
- Sana separatorlarini qo‘yadi.
- Typing indicator, online/offline presence, read ticks ko‘rsatadi.
- Emoji picker bor.
- Reply preview bor.
- Context menu orqali reply, copy, edit, delete qiladi.
- Desktopda Enter yuboradi, Shift+Enter yangi qator qiladi; mobileda Enter standart qoladi.
- Visual viewport asosida mobile keyboard balandligini hisobga oladi.

## Static va media

Static sozlama:

```python
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]
```

WhiteNoise `CompressedManifestStaticFilesStorage` bilan sozlangan. `staticfiles/` katalogi yig‘ilgan fayllarni saqlaydi. Source o‘zgarishlari `static/` ichida qilinishi kerak, keyin `collectstatic` ishlatiladi.

Media sozlama:

```python
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
```

`config/urls.py` media servingni faqat `DEBUG=True` holatda ulaydi. `DEBUG=False` bo‘lganda production web server media fayllarni alohida servis qilishi kerak.

## Ishga tushirish

Minimal local ishga tushirish oqimi:

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
redis-server
daphne config.asgi:application
```

Django dev server:

```bash
python manage.py runserver
```

Lekin WebSocket uchun Daphne ishlatish to‘g‘riroq:

```bash
daphne config.asgi:application
```

Google OAuth ishlashi uchun Django admin yoki environment orqali allauth social app sozlanishi kerak. Hozir repo ichida Google client secret ko‘rinmaydi.

## Muhit va production sozlamalari

Hozirgi sozlamalar productionga yaqin:

- `DEBUG = False`
- `SECURE_SSL_REDIRECT = True`
- `ACCOUNT_DEFAULT_HTTP_PROTOCOL = "https"`
- `CSRF_TRUSTED_ORIGINS` ichida `talkup.uz` va `www.talkup.uz`
- `ALLOWED_HOSTS = ['*']`

Localda `DEBUG=False` va `SECURE_SSL_REDIRECT=True` sabab oddiy HTTP orqali ishlatishda redirect yoki static/media muammolari chiqishi mumkin. Local development uchun alohida `.env` yoki `local_settings.py` tavsiya qilinadi.

Production uchun zarur infratuzilma:

- ASGI server: Daphne yoki uvicorn/daphne process manager.
- Redis: Channels uchun majburiy.
- Reverse proxy: Nginx/Caddy, WebSocket upgrade headerlari bilan.
- Static: WhiteNoise yoki reverse proxy.
- Media: Nginx/S3/objekt storage.
- Database: SQLite o‘rniga PostgreSQL.
- Secrets: env variable yoki secret manager.

## Test holati

`core/tests.py` bo‘sh. Avtomatlashtirilgan testlar mavjud emas.

Qo‘shilishi kerak bo‘lgan eng muhim testlar:

- Search API authentication va minimum query length.
- Chat list faqat mavjud conversationlarni qaytarishi.
- Private chatda o‘zi bilan chat qilish bloklanishi.
- Message encryption/decryption.
- WebSocket connect anonymous userni rad etishi.
- Message send, edit, delete permissionlari.
- Read receipt logikasi.
- Profile update valid/invalid holatlari.
- Staff bo‘lmagan user verify endpointdan foydalana olmasligi.

## Aniqlangan risklar va texnik qarz

1. `SECRET_KEY` va `MESSAGE_ENCRYPTION_KEY` kod ichida hardcoded. Bu productionda jiddiy xavfsizlik riski.
2. `ALLOWED_HOSTS = ['*']` production uchun juda keng.
3. `DEBUG=False` local developmentni qiyinlashtiradi; environmentga qarab sozlash yo‘q.
4. SQLite real production chat uchun mos emas. Concurrent write va scale cheklovlari bor.
5. `CACHES` local memory cache. Online status multi-process deploymentda noto‘g‘ri ishlashi mumkin.
6. `staticfiles/` repo ichida turibdi. Bu deployment strategiyasiga bog‘liq, lekin odatda source repo uchun ortiqcha shovqin yaratadi.
7. `db.sqlite3` `.gitignore`da bor, lekin ishchi katalogda mavjud. Gitga tushmasligi kerak.
8. Frontend CDNlarga bog‘langan: Tailwind, Lucide, CropperJS. Internet yoki CDN muammosi UIga ta’sir qiladi.
9. `devtools-blocker.js` ishlatiladi. Bu xavfsizlik bermaydi, lekin foydalanuvchi tajribasiga salbiy ta’sir qilishi mumkin.
10. Xabarlarni o‘chirish fizik delete qiladi. Audit, moderation yoki recovery kerak bo‘lsa soft delete yaxshiroq.
11. Chat delete ikki user orasidagi barcha xabarlarni o‘chiradi. Bu ikkinchi user tarixini ham yo‘qotadi; "faqat men tomondan o‘chirish" semantikasi yo‘q.
12. Xabar shifrlangan bo‘lsa ham server har xabarni deshifrlaydi; bu end-to-end encryption emas.
13. `last_seen` saqlanadi, lekin UI da aniq ishlatilmayapti.
14. Rate limiting yo‘q. Search, WebSocket message send va typing event spamga ochiq.
15. Username update uniqueness xatosi form orqali qaytadi, lekin UX minimal.

## Tavsiya etilgan keyingi ishlar

1. `SECRET_KEY`, `MESSAGE_ENCRYPTION_KEY`, database URL, Redis URL va OAuth sozlamalarini env variablega ko‘chirish.
2. Development va production settingsni ajratish.
3. PostgreSQLga o‘tish va Redis cache backend ulash.
4. WebSocket va search uchun rate limiting qo‘shish.
5. Message modelga indekslar qo‘shish:

```python
models.Index(fields=["sender", "receiver", "created_at"])
models.Index(fields=["receiver", "is_read"])
```

6. Chat delete semantikasini qayta ko‘rib chiqish: global delete, per-user hide yoki soft delete.
7. Automated testlar qo‘shish.
8. Static CDN dependencylarini self-host qilish yoki fallback qo‘shish.
9. Media serving uchun production strategiyasini aniqlash.
10. `README.md`ni kengaytirib, local setup, Redis, env va deployment bo‘limlarini qo‘shish.

## Umumiy baho

Loyiha kichik real-time chat ilovasi uchun funksional asosga ega: OAuth login, private chat, read receipts, typing, reply, edit/delete, avatar crop va verified badge kabi mahsulotga yaqin detallar mavjud. Asosiy zaif joylar production konfiguratsiyasi, secrets boshqaruvi, persistence/cache scale masalalari va testlar yo‘qligi. Kod tuzilmasi tushunarli, lekin deploymentga tayyor holatga olib chiqish uchun environment separation, database/cache infratuzilmasi va security hardening birinchi navbatda qilinishi kerak.
