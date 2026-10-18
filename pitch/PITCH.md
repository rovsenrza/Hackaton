# AYAN: pitch ssenarisi (4 dəq + 3 dəq sual-cavab)

Deck: [`AYAN_pitch.pptx`](AYAN_pitch.pptx): 10 əsas slayd və 6 əlavə slayd (sual-cavab üçün). Hər slaydın danışıq mətni və vaxtı slaydın qeydlərindədir (speaker notes).

**Əsas qayda:** münsif bir şeyi yadda saxlayır. Bizim üçün o, bu cümlədir: *eyni büdcə ilə AYAN təsadüfi seçimdən ×7,5 çox yeni səfər verir.* Qalan hər şey bu cümləyə xidmət edir.

**Rollar (təklif):** İlham danışır, Rövşən demonu idarə edir və texniki suallara cavab verir, Talib biznes suallarına cavab verir.

## Vaxt planı

| Vaxt | Slayd | Nə deyilir |
|---|---|---|
| 0:00–0:10 | 1. AYAN | "Biz AYAN-ı təqdim edirik: hub-ların harada olduğunu yox, harada qurulmalı olduğunu sübut edir." |
| 0:10–0:30 | 2. Hekayə | "Gəncədən Beynəlxalq Avtovağzala gəldiniz. Bakının ən yaxşı avtovağzalı 5 baldan 2,9 alır: parkinq 878 m-dədir. Qalan ikisi 0,4 və 0,2 alır." |
| 0:30–0:55 | 3. Problem | "Sakinlərin 71,5%-nin, yəni ~2 mln nəfərin 5 dəqiqəlik məsafəsində parkinq yoxdur. Yeni məntəqələrin 97,8%-i isə köhnələrin yanına qoyulub: şəbəkə sıxlaşır, boşluq bağlanmır." |
| 0:55–1:05 | 4. Həll | "AYAN xəritə deyil, qərar alətidir: harada qurmalı, hansı ardıcıllıqla və nə qədər fayda ilə. İndi canlı göstərək." |
| 1:05–2:25 | 5. **Canlı demo** | Aşağıdakı 4 addım |
| 2:25–2:50 | 6. Sübut | "Eyni 10 hub ilə təsadüfi seçimdən ×7,5, 'mərkəzə yaxın' qaydasından ×20 çox yeni səfər. Mərkəz effekti çıxılanda AUC 0,76, baza xətti 0,54. Müstəqil Apar datası ilə 0,69." |
| 2:50–3:10 | 7. Təsir | "İlk 20 hub xidmətsiz tələbatın 12,1%-ni bağlayır, ~12 300 sakin ilk dəfə 5 dəqiqəlik çıxış qazanır. Yalnız artım sayılır." |
| 3:10–3:30 | 8. Növbəti addım | "AYNA ilə 3 aylıq, 10 hub-lıq pilot. Model: B2G platforma, AYNA ilk müştəri." |
| 3:30–3:45 | 9. Komanda | "Üç nəfərik: Rövşən data, model, engine və tətbiq; Talib biznes və tədqiqat; İlham pitch və təqdimat." |
| 3:45–4:00 | 10. Bağlanış | "Hub-u qurmazdan əvvəl sınayın. Təklifimiz: AYNA ilə 10 hub-lıq pilot." |

## Demo addımları (1:20, məşq olunmalıdır)

1. **Xəritə** (açılışda): istilik xəritəsi xidmət olunmamış tələbatı göstərir. "Tünd çəhrayı yerlərdə insan çoxdur, parkinq isə yoxdur."
2. **Beynəlxalq Avtovağzala klik:** gəliş balı 2,9/5, metro 320 m, parkinq 878 m. ⚠️ Şəhər görünüşündə avtovağzal ikonunu AYNA mübadilə mərkəzi və #49 hub örtür: klik hub kartını açır. Əvvəlcə avtovağzalın üstünə 5–6 dəfə scroll ilə zoom edin, sonra #49-un sağındakı avtovağzal ikonuna klik edin.
3. **Tikinti ardıcıllığı** (aşağıdakı xətt) → 1 nömrəli hub: "20 Yanvar metrosu. Sarı sahə real piyada şəbəkəsi ilə 5 dəqiqəlik zonadır, dairə deyil. İlk 20 hub boşluğun 12%-ni bağlayır."
4. **What-if:** "Öz hub-unuzu yoxlayın" → boş bir yerə klik. Hub ~0,5 saniyəyə icazəli yerə yerləşdirilir və rəqəmlər yenilənir. *Bu addım üçün engine lazımdır.*

"Eyni büdcə" cədvəlini demoda açmırıq, çünki 6-cı slayd onu göstərir. Rəhbərlik panelini, kopilotu, 3D-ni və keyfiyyət mərkəzini yalnız sual gəlsə açın (əlavə slaydlar 12–13).

## Demodan əvvəl yoxlama siyahısı

- [ ] Engine işləyir (`/health`), sağ yuxarıda "Ehtiyat rejimi" yazısı **görünmür**
- [ ] Engine başlayandan sonra ~10 s gözlənilib (canlı Apar keşi arxa planda dolur)
- [ ] What-if bir dəfə sınanıb
- [ ] Brauzer tam ekrandadır, zoom 100%-dir, bildirişlər bağlıdır
- [ ] İnternet kəsilsə: ehtiyat demo videosu ([`demo_backup.mp4`](demo_backup.mp4)) açılmağa hazırdır. Statik rejim (engine-siz) xəritəni və paneli yenə də göstərir
- [ ] Taymerlə 3 dəfə məşq edilib (4:00-ı keçməmək)

## Sual-cavab: hazır cavablar

**Data Science (Tərlan Cəbiyev):**
- *"Model nə qədər dəqiqdir?"* → Mərkəz effekti çıxılanda, yəni 1 km-lik halqalar daxilində, tələbat indeksi AYNA-nın parkinq yerlərini AUC 0,76 ilə tanıyır (95% CI 0,75–0,78). "Mərkəzə yaxınlıq" baza xətti burada 0,54 verir. Müstəqil mənbə olan Apar vasitə mövqeləri ilə AUC 0,69-dur. Bütün şəhər üzrə rəqəm 0,95-dir, amma orada mərkəzə yaxınlıq da 0,92 verir. Ona görə əsas rəqəm kimi halqa testini göstəririk.
- *"Avtobus tələbat modeli zəif deyil?"* → Bəli, zəifdir: 56 marşrutla öyrədilib, MdAPE ~27%-dir (baza xətti 37%). Buna görə UI-də 🟡 "proqnoz" kimi işarələnib və AYNA-nın rəsmi gündəlik cəminə kalibrlənib. BakıKart validasiyaları gələn kimi bu model onlarla əvəz olunur. "Data tələbi" paneli məhz bunu göstərir.
- *"Niyə MCLP greedy?"* → (1−1/e) keyfiyyət zəmanəti var və optimallaşdırma ~25 ms çəkir, ona görə ssenari dəyişəndə nəticə dərhal yenilənir. Hub-lar arasında ən azı 300 m məsafə qoyulub.
- *"AYNA-nın 7 rəsmi mübadilə mərkəzindən neçəsini tapır?"* → Top-10-da 2-sini (təsadüfi seçimdə gözlənilən 0,25-dir), top-50-də 3-ünü. Bu gözləniləndir: biz *xidmətsiz* tələbatı axtarırıq, mövcud mərkəzlər isə artıq xidmət olunan yerlərdir.

**İT arxitektor (Fərrux Əhədli):**
- *"On-prem işləyə bilər?"* → Bəli. MapLibre və OpenFreeMap açar və lisenziya tələb etmir, engine FastAPI-dir. Hədəf AYNA serverində PostGIS + Docker Compose-dur.
- *"What-if niyə yarım saniyə çəkir?"* → Hər klikdə real piyada qrafında (750 min düyün) yer seçilir: hub yolun hərəkət hissəsinə, binaya və suya düşməsin deyə səki zolağına köçürülür, sonra izoxron qurulur. Canlı mənbələr arxa planda keşlənir, sorğunu gözlətmir.
- *"Canlı AYNA və Apar datasını necə alırsınız?"* → Demoda ictimai tətbiqlərin istifadə etdiyi endpoint-lərdən. Pilotda bunu rəsmi data mübadiləsi ilə əvəz etməyi təklif edirik. Hər mənbə ayrıca moduldur, dəyişiklik bir faylla məhdudlaşır.
- *"Kopilot datanı xarici buluda göndərir?"* → Yalnız aqreqat göstəriciləri göndərir: hub rəqəmləri, ərazi adları. Fərdi data göndərilmir. Kopilot istəyə bağlıdır: açar olmasa tam sönür, sistem isə eyni işləyir. Rəqəmlər həmişə engine-dən gəlir, model rəqəm uydurmur.

**Biznes (Elxan Şükürov, Nail Seyidov):**
- *"Kim istifadə edəcək, kim ödəyəcək?"* → AYNA-nın planlaşdırma və strateji şöbələri. Model B2G-dir: on-prem lisenziya və dəstək. Sonra eyni pipeline digər şəhərlərə (Gəncə, Sumqayıt) tətbiq olunur.
- *"5 ton CO₂ azdır."* → Bəli, bu dürüst rəqəmdir: 10 hub ~220 əlavə səfər/gün verir. Dəyər CO₂-də deyil, büdcənin düzgün yerə xərclənməsindədir: eyni pulla ×7,5 çox istifadə. Boşluq tam bağlansa, yuxarı hədd ~939 t/il-dir (309–1 634). AYAN CO₂-ni ilk dəfə ölçülə bilən edir.
- *"Rəqiblərdən fərqiniz nədir?"* → Xəritə hamıda var. Bizdə isə real piyada şəbəkəsində ölçülmüş və doğrulanmış qərar var: harada, hansı ardıcıllıqla və nə qədər fayda ilə.
- *"Data keyfiyyəti haqqında nə tapdınız?"* → AYNA-nın rəsmi velo-parkinq faylında Google Earth nümunə turu qalıb: Eyfel qülləsi, Titanik və daha 8 nöqtə. 222 dayanacaq adında kiril "ә" var, 55 KMZ marşrutu cari şəbəkədə yoxdur. AYAN bunları avtomatik tapır və insan təsdiqinə verir (əlavə slayd 16).

**Komanda:**
- *"Kim nə etdi?"* → Rövşən Rzayev data pipeline-ı, modeli, Geo Engine-i və tətbiqi qurub. Talib İsgəndərli biznes modeli və tədqiqatla, İlham Süleymanov pitch və təqdimatla məşğul olub. Sürət üçün AI alətlərindən istifadə etdik, amma hər metodoloji qərar `docs/PLAN.md`-də əsaslandırılıb. Pilot üçün plan: GIS mütəxəssisi əlavə etmək və AYNA-nın Data Science komandası ilə birgə işləmək.
