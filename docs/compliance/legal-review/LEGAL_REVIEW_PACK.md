# Legal review pack

Státusz: `LEGAL_REVIEW_REQUIRED`. A táblák candidate tételek, nem jóváhagyott jogi tanácsok.

## adatvedelem
| Követelmény | Trigger | Intézkedés | Dokumentum | Nyitott kérdés |
| --- | --- | --- | --- | --- |
| Adatkezelési tevékenységek nyilvántartása - adatkezelő | Az adatkezelő személyes adatot kezel, és a 30. cikk (5) kivétel nem alkalmazható. | A 30. cikk (1) szerinti nyilvántartás vezetése és megkeresésre rendelkezésre bocsátása. | EXPLICIT_DOCUMENT_REQUIRED | A 250 fő alatti kivétel négy törvényi kivételét a külön applicability rule kezeli. |
| Adatkezelési tájékoztatás közvetlen adatgyűjtéskor | Személyes adat közvetlen gyűjtése az érintettől. | A 13. cikk (1)-(2) szerinti információk rendelkezésre bocsátása. | EXPLICIT_DOCUMENT_REQUIRED | Jogászi felülvizsgálat szükséges. |
| Adatvédelmi incidens bejelentése a felügyeleti hatóságnak | Az adatvédelmi incidens valószínűsíthetően kockázattal jár az érintettek jogaira és szabadságaira nézve. | Bejelentés a felügyeleti hatóságnak a 33. cikk szerinti minimális tartalommal. | DOCUMENTED_EVIDENCE_REQUIRED | Jogászi felülvizsgálat szükséges. |
| Adatvédelmi incidensek nyilvántartása | Adatvédelmi incidens történik. | Az incidenshez kapcsolódó tények, hatások és orvosló intézkedések nyilvántartása. | EXPLICIT_DOCUMENT_REQUIRED | Jogászi felülvizsgálat szükséges. |
| Érintett tájékoztatása adatvédelmi incidensről | Az incidens valószínűsíthetően magas kockázattal jár, és a 34. cikk (3) szerinti kivétel nem áll fenn. | Világos és közérthető tájékoztatás az érintettnek. | DOCUMENTED_EVIDENCE_REQUIRED | Jogászi felülvizsgálat szükséges. |

## fogyasztovedelem
| Követelmény | Trigger | Intézkedés | Dokumentum | Nyitott kérdés |
| --- | --- | --- | --- | --- |
| Panaszkezelési tájékoztatás | A vállalkozás fogyasztóval áll kapcsolatban. | A 17/A. § (1)-(1a) szerinti panaszkezelési és békéltető testületi tájékoztatás biztosítása. | EXPLICIT_DOCUMENT_REQUIRED | Jogászi felülvizsgálat szükséges. |
| Fogyasztói panasz jegyzőkönyve | A szóbeli panasz azonnali kivizsgálása nem lehetséges vagy a fogyasztó nem ért egyet a kezeléssel. | A 17/A. § (5) szerinti jegyzőkönyv felvétele és másolat kezelése. | EXPLICIT_DOCUMENT_REQUIRED | Jogászi felülvizsgálat szükséges. |
| Írásbeli fogyasztói panasz érdemi megválaszolása | Írásbeli fogyasztói panasz érkezik. | Írásbeli, érdemi és igazolható válasz; elutasítás esetén indokolás. | DOCUMENTED_EVIDENCE_REQUIRED | Jogászi felülvizsgálat szükséges. |
| Fogyasztói panasz iratainak megőrzése | Szóbeli panaszról jegyzőkönyv vagy írásbeli panasz és válasz keletkezik. | Az iratok megőrzése és hatósági felhívásra bemutatása. | EXPLICIT_DOCUMENT_REQUIRED | Jogászi felülvizsgálat szükséges. |

## governance
| Követelmény | Trigger | Intézkedés | Dokumentum | Nyitott kérdés |
| --- | --- | --- | --- | --- |
| Belső visszaélés-bejelentési rendszer létrehozása | Legalább 50 foglalkoztatott, vagy a 18. § (2) szerinti különös kategória. | Belső rendszer létrehozása és pártatlan működtető kijelölése vagy megfelelő külső működtető megbízása. | DOCUMENTED_EVIDENCE_REQUIRED | Jogászi felülvizsgálat szükséges. |
| Írásbeli visszaélés-bejelentés visszaigazolása | Írásbeli bejelentés érkezik a belső rendszerben. | Visszaigazolás és általános eljárási/adatkezelési tájékoztatás küldése. | DOCUMENTED_EVIDENCE_REQUIRED | Jogászi felülvizsgálat szükséges. |
| Visszaélés-bejelentés kivizsgálása | Belső rendszerben bejelentés érkezik, és a kivizsgálás nem mellőzhető. | A bejelentés kivizsgálása. | DOCUMENTED_EVIDENCE_REQUIRED | Jogászi felülvizsgálat szükséges. |
| Visszaélés-bejelentés kivizsgálási határidejének meghosszabbítása | Különösen indokolt esetben a 30 napos határidő nem elegendő. | A bejelentő tájékoztatása a várható időpontról és a hosszabbítás indokáról. | DOCUMENTED_EVIDENCE_REQUIRED | Jogászi felülvizsgálat szükséges. |
| Visszaélés-bejelentés eredményéről való tájékoztatás | A kivizsgálás lezárult vagy mellőzésre került. | Írásbeli tájékoztatás a mellőzésről/indokáról, eredményről és intézkedésekről. | DOCUMENTED_EVIDENCE_REQUIRED | Jogászi felülvizsgálat szükséges. |
| Visszaélés-bejelentési rendszer hozzáférhető tájékoztatója | Belső visszaélés-bejelentési rendszer működik. | Világos és könnyen hozzáférhető információ nyújtása a rendszer működéséről és eljárásáról. | EXPLICIT_DOCUMENT_REQUIRED | Jogászi felülvizsgálat szükséges. |

## Wave 3A - AI

| Követelmény | Szereplő | Alkalmazás | Dokumentum/kontroll | Forrás | Nyitott kérdés |
| --- | --- | --- | --- | --- | --- |
| MI-jártassági intézkedések | A source-grounded role and scope rule szerint érintett szervezet | 2025-02-02 | DOCUMENTED_EVIDENCE_REQUIRED | A-AIA-3-4, A-AIA-113 | A cikk intézkedést ír elő, de önálló írásbeli AI-policyt nem nevesít; policy csak hasznos implementációs kontroll. |
| Nagy kockázatú MI-rendszer alkalmazói működtetési kontrolljai | A source-grounded role and scope rule szerint érintett szervezet | 2026-08-02 | DOCUMENTED_EVIDENCE_REQUIRED | A-AIA-26, A-AIA-113 | A nagy kockázatú minősítéshez jogi/osztályozási vizsgálat szükséges; a szabály nem minden AI-eszközre vonatkozik. |
| Nagy kockázatú MI-rendszer automatikus naplóinak megőrzése | A source-grounded role and scope rule szerint érintett szervezet | 2026-08-02 | EXPLICIT_DOCUMENT_REQUIRED | A-AIA-26, A-AIA-113 | A GDPR vagy más alkalmazandó jog eltérő megőrzési kötelezettséget eredményezhet; az összehangolás jogászi feladat. |

## Wave 3A - Cybersecurity

| Követelmény | Szereplő | Alkalmazás | Dokumentum/kontroll | Forrás | Nyitott kérdés |
| --- | --- | --- | --- | --- | --- |
| Elektronikus információs rendszerek biztonsági osztályba sorolása | A source-grounded role and scope rule szerint érintett szervezet | 2026-07-29 | EXPLICIT_DOCUMENT_REQUIRED | A-HU-CYBER-1, A-HU-CYBER-10-11, A-HU-CYBER-IMPL-1 | A 2-3. mellékletben való ágazati besorolás és egyes kivételek külön jogi ellenőrzést igényelnek. |
| Elektronikus információs rendszer biztonságáért felelős személy kijelölése | A source-grounded role and scope rule szerint érintett szervezet | 2026-07-29 | DOCUMENTED_EVIDENCE_REQUIRED | A-HU-CYBER-1, A-HU-CYBER-10-11, A-HU-CYBER-IMPL-1 | A képesítési és szerződéses részletszabályokhoz a teljes végrehajtási anyag és jogászi vizsgálat szükséges. |

## Wave 3A - Digital services

| Követelmény | Szereplő | Alkalmazás | Dokumentum/kontroll | Forrás | Nyitott kérdés |
| --- | --- | --- | --- | --- | --- |
| DSA hatósági kapcsolattartó pont | A source-grounded role and scope rule szerint érintett szervezet | 2024-02-17 | EXPLICIT_DOCUMENT_REQUIRED | A-DSA-2, A-DSA-11-14 | Közvetítő szolgáltatási minősítés szükséges; egy átlagos webshop önmagában nem feltétlenül közvetítő szolgáltatás. |
| DSA szerinti szerződési feltétel és tartalommoderálási átláthatóság | A source-grounded role and scope rule szerint érintett szervezet | 2024-02-17 | EXPLICIT_DOCUMENT_REQUIRED | A-DSA-2, A-DSA-11-14 | A tényleges közvetítőszolgáltatási szerep és moderálási folyamat jogi/funkcionális felmérést igényel. |
| Elektronikus megrendelés visszaigazolása | A source-grounded role and scope rule szerint érintett szervezet | 2026-01-01 | DOCUMENTED_EVIDENCE_REQUIRED | A-ECOM-5-6 | A nem fogyasztó igénybevevővel kötött szerződésben az eltérés lehetősége forrásszövegben szerepel; szerződéses minősítés szükséges. |

## Wave 3A - Financial digital resilience

| Követelmény | Szereplő | Alkalmazás | Dokumentum/kontroll | Forrás | Nyitott kérdés |
| --- | --- | --- | --- | --- | --- |
| DORA szerinti IKT-kockázat irányítás | A source-grounded role and scope rule szerint érintett szervezet | 2025-01-17 | DOCUMENTED_EVIDENCE_REQUIRED | A-DORA-2, A-DORA-5 | Nem pénzügyi szervezetnél ez a DORA-követelmény nem alkalmazandó; pénzügyi jogállás meghatározása jogi ellenőrzést igényelhet. |

## Wave 3B - Product / chemicals / export / customs

- **REACH szerinti biztonsági adatlap átadása**: A szállító veszélyes anyagot vagy keveréket szolgáltat a 31. cikk hatálya szerinti címzettnek. | A biztonsági adatlapot a címzett részére a rendelet szerinti esetben rendelkezésre bocsátja. | EXPLICIT_DOCUMENT_REQUIRED | VERSION_AMBIGUITY_NON_MATERIAL_FOR_THIS_PROVISION: a két capture releváns 31. cikkes szövege normalizálva azonos; REACH-szerep és termékbesorolás specialistai kapu.
- **CLP szerinti osztályozás, címkézés és csomagolás**: A gyártó, importőr vagy downstream felhasználó anyagot/keveréket hoz forgalomba, és a CLP szerinti minősítés érintett. | A forgalomba hozatal előtt elvégzi a rendelet szerinti osztályozást, valamint gondoskodik a címkézésről és csomagolásról. | DOCUMENTED_EVIDENCE_REQUIRED | A veszélyességi osztály és címketartalom kémiai/szakértői minősítés, nem profiladatból automatizálható.
- **Kettős felhasználású ügylet engedélyezési felülvizsgálata**: Az ügylet exportot, transzfert, brókertevékenységet, technikai segítségnyújtást vagy tranzitot érint, és a tétel/célország/végfelhasználás exportkontroll-kaput jelez. | Az ügyletet az alkalmazandó engedélyezési szabály szerint felülvizsgálja, és engedélykötelezettség esetén engedély nélkül nem teljesíti. | DOCUMENTED_EVIDENCE_REQUIRED | A listás tétel, catch-all, végfelhasználás és rendeltetés exportkontroll-szakértői minősítés.
- **Uniós vámkódex szerinti vámhatósági információ pontossága**: A gazdasági szereplő vámhatósági nyilatkozatot, kérelmet vagy döntéshez szükséges információt nyújt be. | A vámhatóság részére a szükséges okmányokat és pontos, teljes információt rendelkezésre bocsátja, és együttműködik. | DOCUMENTED_EVIDENCE_REQUIRED | Tarifális és vámérték-minősítés jogi/technikai szakértői határ.
- **EU-s felelős gazdasági szereplő és dokumentáció rendelkezésre állása**: Az érintett termék uniós jogharmonizációs szabály szerinti termék, amelyet uniós piacon hoznak forgalomba, és a 4. cikk feltételei érintettek. | Biztosítja a megfelelő uniós gazdasági szereplőt és kérésre rendelkezésre bocsátja a megfelelőségi dokumentációt/hatósági együttműködéshez szükséges információt. | DOCUMENTED_EVIDENCE_REQUIRED | Termékjogszabályi hatály és megfelelőségértékelés termékspecifikus specialistai kérdés.

## Corporate integrity / anti-bribery

- **HU:ACT:2000:XXXVII**: Hungarian promulgation of the OECD Convention. Reviewed state-level criminalisation, legal-person liability and accounting-law measures. **No direct company compliance-template requirement extracted.** No foreign-law nexus rule was created because UK Bribery Act and FCPA primary source text are absent from the corpus.

## Employment / workforce safety

- **Munkavédelmi kockázatértékelés:** A munkáltató a tevékenység megkezdése előtt, majd eltérő jogszabályi rendelkezés hiányában legalább öt évente készíti és dokumentálja. A változás vagy esemény által kiváltott felülvizsgálat ettől külön kötelezettség.
- **Munkabaleset:** A munkaképtelenséggel járó baleset kivizsgálása és dokumentálása külön candidate; a súlyos baleset haladéktalan hatósági bejelentése és a helyszín megőrzése külön, specialistai minősítési kapu mögötti candidate.
- **Munkáltatói írásbeli tájékoztatás:** Az új munkaviszony utáni hét napos írásbeli tájékoztatás és a változás hatálybalépésekor esedékes tájékoztatás külön candidate. Nem készült munkaszerződés vagy más DOCX-sablon.

## Consumer commerce

- **Távollévők közötti szerződés:** a 45/2014. Korm. rendelet szerinti előzetes információ, fizetési kötelezettséget jelző online megrendelési felület és tartós adathordozós visszaigazolás külön candidate. A B2C státusz önmagában nem elég: szerződési és csatorna-tény szükséges.
- **Elállás:** az előzetes tájékoztatás és az esemény utáni, 14 napon belüli visszatérítés külön candidate. A kizárások, digitális tartalom és teljesítés előtti szolgáltatás specialistai kapun maradnak.
- **Kötelező jótállás:** csak a rendelet szerinti új tartós fogyasztási cikkek termékkategória- és értékhatár-minősítése után jön létre tájékoztatási/jótállási jegy candidate. Nem készült új DOCX a kategória-megállapítás és a hiányos 19/2014. NGM korpusz miatt.
- **E-kereskedelmi akadálymentesség:** a 2022. évi XVII. törvény potenciális e-kereskedelmi szolgáltatási hatálya külön specialistai kapu; nem teszi a webshopot DSA-közvetítővé.
