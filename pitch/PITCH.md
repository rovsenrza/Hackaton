# AYAN: pitch ssenarisi (4 dəq + 3 dəq sual-cavab)

Deck: [`AYAN_pitch.pptx`](AYAN_pitch.pptx). Hər slaydın danışıq mətni slaydın qeydlərindədir (speaker notes).

**Əsas qayda:** münsif bir şeyi yadda saxlayır. Bizim üçün o, bu cümlədir: *eyni büdcə ilə AYAN təsadüfi seçimdən ×7,5 çox yeni səfər verir.* Qalan hər şey bu cümləyə xidmət edir.

## Vaxt planı

| Vaxt | Slayd | Nə deyilir |
|---|---|---|
| 0:00–0:25 | 1–2. Hekayə | "Gəncədən Beynəlxalq Avtovağzala gəldiniz. Metro 320 m-dədir, amma ən yaxın velo-parkinq 878 m-dədir. Bakının qalan iki avtovağzalı 5 baldan 0,4 və 0,2 alır." |
| 0:25–0:50 | 3. Problem | "Sakinlərin 72%-nin, yəni ~2 mln nəfərin 5 dəqiqəlik məsafəsində parkinq yoxdur. Yeni məntəqələrin 98%-i isə köhnələrin yanına qoyulub: şəbəkə sıxlaşır, amma boşluq bağlanmır." |
| 0:50–1:00 | 4. Həll | "AYAN xəritə deyil, qərar alətidir: harada qurmalı, hansı ardıcıllıqla və nə qədər fayda ilə." |
| 1:00–2:30 | 5. **Canlı demo** | Aşağıdakı 5 addım |
| 2:30–3:00 | 6. Sübut | "Eyni 10 hub büdcəsi ilə təsadüfi seçimdən ×7,5, 'mərkəzə yaxın' qaydasından ×20 çox yeni səfər alırıq. Model mərkəz effektindən təmizlənmiş testdə də işləyir." |
| 3:00–3:20 | 7. Data keyfiyyəti | "AYNA-nın rəsmi parkinq faylında Eyfel qülləsi və Titanik var. AYAN bunu avtomatik tapır." (gülüş anı) |
| 3:20–3:40 | 8–9. Arxitektura və yol xəritəsi | "On-prem işləyir, açar tələb etmir. Pilot: rəsmi feed-lər və top-10 hub-un sahə auditi." |
| 3:40–4:00 | 10. Bağlanış | "Hub-u qurmazdan əvvəl sınayın." |

## Demo addımları (1:30, məşq olunmalıdır)

1. **Xəritə** (açılışda): istilik xəritəsi xidmət olunmamış tələbatı göstərir. "Tünd çəhrayı yerlərdə insan çoxdur, parkinq isə yoxdur."
2. **Beynəlxalq Avtovağzala klik:** gəliş balı 2,9/5, metro 320 m, parkinq 878 m.
3. **Tikinti ardıcıllığı** (aşağıdakı xətt): "1 nömrəli hub 20 Yanvar metrosudur. İlk 20 hub boşluğun 12%-ni bağlayır."
4. **What-if:** "Öz hub-unuzu yoxlayın" → boş bir yerə klik → rəqəmlər dərhal yenilənir. *Bu addım üçün engine lazımdır.*
5. **Rəhbərlik paneli → "Eyni büdcə, fərqli seçim"** cədvəli: ×7,5 və ×20.

Kopilotu, 3D-ni və keyfiyyət mərkəzini yalnız sual gəlsə açın.

## Demodan əvvəl yoxlama siyahısı

- [ ] Engine işləyir (`/health`), sağ yuxarıda "Ehtiyat rejimi" yazısı **görünmür**
- [ ] What-if bir dəfə sınanıb
- [ ] Brauzer tam ekrandadır, zoom 100%-dir, bildirişlər bağlıdır
- [ ] İnternet kəsilsə: ekran videosu masaüstündə hazırdır. Statik rejim (engine-siz) xəritəni və paneli yenə də göstərir
- [ ] Taymerlə 3 dəfə məşq edilib (4:00-ı keçməmək)

## Sual-cavab: hazır cavablar

**Data Science (Tərlan Cəbiyev):**
- *"Model nə qədər dəqiqdir?"* → Tələbat indeksi AYNA-nın öz parkinq seçimlərini AUC 0,95 ilə tanıyır. Bunun böyük hissəsi mərkəz effektidir və biz bunu özümüz aşkar etdik. Mərkəz effekti çıxılanda, yəni 1 km-lik halqalar daxilində, AUC 0,76-dır (95% CI 0,75–0,78). "Mərkəzə yaxınlıq" baza xətti burada 0,54 verir. Müstəqil mənbə olan Apar vasitə mövqeləri ilə AUC 0,69-dur.
- *"Avtobus tələbat modeli zəif deyil?"* → Bəli, zəifdir: 56 marşrutla öyrədilib, MdAPE ~27%-dir (baza xətti 37%). Buna görə UI-də 🟡 "proqnoz" kimi işarələnib və AYNA-nın rəsmi gündəlik cəminə kalibrlənib. BakıKart validasiyaları gələn kimi bu model onlarla əvəz olunur. "Data tələbi" paneli məhz bunu göstərir.
- *"Niyə MCLP greedy?"* → (1−1/e) keyfiyyət zəmanəti var və saniyədən tez işləyir, ona görə what-if canlı rejimdə işləyə bilir. Hub-lar arasında ən azı 300 m məsafə qoyulub.
- *"AYNA-nın 7 rəsmi mübadilə mərkəzindən neçəsini tapır?"* → Top-10-da 2-sini (təsadüfi seçimdə gözlənilən 0,25-dir), top-50-də 3-ünü. Bu gözləniləndir: biz *xidmətsiz* tələbatı axtarırıq, mövcud mərkəzlər isə artıq xidmət olunan yerlərdir.

**İT arxitektor (Fərrux Əhədli):**
- *"On-prem işləyə bilər?"* → Bəli. MapLibre və OpenFreeMap açar və lisenziya tələb etmir, engine FastAPI-dir. Hədəf AYNA serverində PostGIS + Docker Compose-dur.
- *"Canlı AYNA və Apar datasını necə alırsınız?"* → Demoda ictimai tətbiqlərin istifadə etdiyi endpoint-lərdən. Pilotda bunu rəsmi data mübadiləsi ilə əvəz etməyi təklif edirik. Hər mənbə ayrıca moduldur, dəyişiklik bir faylla məhdudlaşır.
- *"Kopilot datanı xarici buluda göndərir?"* → Yalnız aqreqat göstəriciləri göndərir: hub rəqəmləri, ərazi adları. Fərdi data göndərilmir. Kopilot istəyə bağlıdır: açar olmasa tam sönür, sistem isə eyni işləyir. Rəqəmlər həmişə engine-dən gəlir, model rəqəm uydurmur.

**Biznes (Elxan Şükürov, Nail Seyidov):**
- *"Kim istifadə edəcək, kim ödəyəcək?"* → AYNA-nın planlaşdırma və strateji şöbələri. Model B2G-dir: on-prem lisenziya və dəstək. Sonra eyni pipeline digər şəhərlərə (Gəncə, Sumqayıt) tətbiq olunur.
- *"5 ton CO₂ azdır."* → Bəli, bu dürüst rəqəmdir: 10 hub ~220 əlavə səfər/gün verir. Dəyər CO₂-də deyil, büdcənin düzgün yerə xərclənməsindədir: eyni pulla ×7,5 çox istifadə. Boşluq tam bağlansa, yuxarı hədd ~939 t/il-dir (309–1 634).
- *"Rəqiblərdən fərqiniz nədir?"* → Xəritə hamıda var. Bizdə isə real piyada şəbəkəsində ölçülmüş və doğrulanmış qərar var: harada, hansı ardıcıllıqla və nə qədər fayda ilə.

**Komanda:**
- *"Tək nəfərsiniz?"* → Bəli. Data, model, backend və frontend-i uçdan-uca özüm etmişəm. Sürət üçün AI alətlərindən istifadə etdim, amma hər metodoloji qərar `docs/PLAN.md`-də əsaslandırılıb. Pilot üçün plan: GIS mütəxəssisi və frontend developer əlavə etmək, AYNA-nın Data Science komandası ilə birgə işləmək.
