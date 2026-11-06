// Machine draft. The owner (and counsel) must review this before it is relied on.
import type { Catalog } from '../../types';

export const legal: Catalog['legal'] = {
  common: {
    effective: 'În vigoare din {date}',
    privacyPolicy: 'Politica de confidențialitate',
    termsOfService: 'Termenii de utilizare',
    helpAndSupport: 'Ajutor și asistență',
    support: 'Asistență',
    backToChefer: '← Înapoi la Chefer',
  },
  terms: {
    metaTitle: 'Termenii de utilizare',
    metaDescription:
      'Regulile de folosire a Chefer, inclusiv avertismentele privind sănătatea, alergenii și inteligența artificială.',
    title: 'Termenii de utilizare',
    effectiveDate: '26 septembrie 2026',
    short: {
      title: 'Pe scurt',
      i1: 'Chefer te ajută să îți planifici mesele, să faci cumpărături, să îți urmărești alimentația și să te antrenezi. Trebuie să ai cel puțin 16 ani.',
      i2: 'Nu înlocuiește sfatul medical. Obiectivele sunt estimări, iar verificările pentru alergeni pot rata anumite lucruri.',
      i3: 'Inteligența artificială poate greși. Verifică ce îți oferă.',
      i4: 'Premium este inclus gratuit, iar Chefer nu cere niciodată datele de plată.',
      i5: 'Îți poți șterge contul oricând.',
    },
    who: {
      title: 'Cine suntem',
      p1: 'Chefer este administrat de Pop Dan-Vlad, o persoană fizică din România („noi”). Acești termeni sunt acordul dintre tine și noi atunci când folosești site-ul Chefer sau aplicația Chefer. În App Store, aplicația pentru iOS este publicată de Smooth Path Digital S.R.L în numele nostru, motiv pentru care Apple afișează această companie drept vânzător; Smooth Path Digital S.R.L nu primește și nu prelucrează datele contului tău Chefer. {privacy} explică cum îți tratăm datele.',
    },
    age: {
      title: 'Cine poate folosi Chefer',
      p1: 'Trebuie să ai cel puțin 16 ani ca să creezi un cont. Prin crearea unui cont confirmi că ai această vârstă.',
    },
    account: {
      title: 'Contul tău',
      p1: 'Dă-ne o adresă de email reală și nu spune nimănui parola. Ești responsabil pentru ce se întâmplă în contul tău. Dacă crezi că altcineva are acces la el, schimbă parola și anunță-ne. Un cont este pentru o singură persoană; membrii gospodăriei pe care îi adaugi sunt profiluri în contul tău, nu conturi separate.',
    },
    fair: {
      title: 'Folosirea corectă a Chefer',
      intro: 'Te rugăm să nu:',
      i1: 'încalci legea și nici să încarci conținut pe care nu ai dreptul să îl distribui;',
      i2: 'încarci nimic dăunător, care incită la ură sau cu conținut sexual explicit;',
      i3: 'încerci să strici, să supraîncarci sau să ocolești limitele serviciului, inclusiv prin extragerea automată a datelor, acces automatizat sau căutarea de vulnerabilități de securitate fără acordul nostru;',
      i4: 'folosești Chefer pentru a construi un serviciu concurent sau pentru a-l revinde;',
      i5: 'folosești contul altei persoane și nici să te dai drept altcineva.',
      outro:
        'Ai găsit o problemă de securitate? Te rugăm să ne scrii, în loc să o testezi mai departe. Ne bucurăm să aflăm.',
    },
    content: {
      title: 'Conținutul tău',
      p1: 'Rețetele, fotografiile, notițele și alt conținut pe care îl adaugi rămân ale tale. Rețetele pe care le imporți sau le creezi rămân în colecția ta personală și nu sunt distribuite altor utilizatori. Ca să putem rula Chefer, ne acorzi o licență gratuită, neexclusivă, de a stoca, copia, prelucra și afișa conținutul tău, doar pentru a-ți furniza serviciul: de exemplu ca să îl afișăm pe dispozitivele tale, să îți scalăm rețetele sau să îl trimitem furnizorului de inteligență artificială atunci când folosești o funcție bazată pe IA. Licența încetează când ștergi conținutul sau contul, cu excepția copiilor de siguranță, care expiră așa cum descrie Politica de confidențialitate.',
      p2: 'Importă doar rețete și fotografii pe care ai voie să le folosești. Rețetele importate sunt pentru uz personal.',
    },
    health: {
      title: 'Sănătate și nutriție: nu este sfat medical',
      p1: 'Chefer oferă informații generale despre alimentație și antrenament. Nu reprezintă sfat medical, dietetic sau profesional de altă natură și nu înlocuiește un medic, un nutriționist sau un antrenor calificat.',
      i1: 'Obiectivele de calorii, proteine și altele, precum și valorile nutriționale ale rețetelor și ale meselor înregistrate, sunt estimări calculate pe baza unor formule și date generale. Pot fi greșite pentru tine.',
      i2: 'Vorbește cu un medic sau cu un nutriționist autorizat înainte să îți schimbi alimentația dacă ești însărcinată sau alăptezi, ai sub 18 ani, ai o afecțiune medicală, iei medicamente sau ai (ori ai avut) o tulburare de alimentație.',
      i3: 'Exercițiile fizice presupun riscul de accidentare. Sugestiile de antrenament sunt generale. Încălzește-te, folosește o greutate pe care o poți controla, oprește-te dacă te doare ceva și cere sfatul unui medic înainte să începi dacă ai orice îngrijorare legată de sănătate.',
    },
    allergies: {
      title: 'Alergii: verifică întotdeauna singur',
      p1: 'Filtrăm rețetele după alergiile și restricțiile pe care le declari și luăm asta în serios. Dar verificările automate sunt făcute cu cea mai bună intenție, fără garanții. Denumirile ingredientelor pot fi ambigue, produsele diferă, etichetele se schimbă, iar inteligența artificială poate greși. Citește întotdeauna lista de ingrediente și eticheta produsului înainte să cumperi, să gătești sau să mănânci. Dacă tu sau cineva pentru care gătești aveți o alergie severă, nu te baza doar pe Chefer: verifică singur fiecare ingredient.',
    },
    ai: {
      title: 'Funcții bazate pe inteligență artificială',
      p1: 'Unele funcții folosesc inteligența artificială pentru a scrie planuri, rețete, răspunsuri și estimări nutriționale sau pentru a citi fotografii. Rezultatul poate fi greșit, incomplet sau depășit, chiar dacă pare sigur. Consideră-l o sugestie și folosește-ți propriul discernământ, mai ales în privința alergiilor, a siguranței alimentare și a temperaturilor de gătit. Funcțiile bazate pe IA trimit datele tale unui furnizor de inteligență artificială doar cu permisiunea ta (vezi Politica de confidențialitate).',
    },
    plans: {
      title: 'Gratuit și Premium',
      p1: 'Chefer are un nivel gratuit și un nivel Premium, cu mai multe funcții și limite zilnice mai mari. Premium este inclus gratuit, iar Chefer nu cere niciodată datele de plată. Dacă vor fi introduse vreodată planuri cu plată, te vom anunța din timp, în aplicație, cu prețul și condițiile, înainte să te decizi. Nu se va percepe nimic automat și nu vei fi trecut la un plan cu plată fără acordul tău. Limitele zilnice ale funcțiilor se pot schimba.',
    },
    availability: {
      title: 'Disponibilitate și modificări',
      p1: 'Chefer este un proiect independent, mic, aflat într-o continuă schimbare. Ne străduim să îl ținem în funcțiune și să îți păstrăm datele în siguranță și facem copii de siguranță zilnice, dar nu putem promite că va fi mereu disponibil sau fără erori. Putem adăuga, schimba sau elimina funcții. Dacă o schimbare elimină ceva important pentru tine, te vom anunța din timp, atunci când putem în mod rezonabil.',
    },
    ending: {
      title: 'Încheierea contului',
      p1: 'Poți înceta să folosești Chefer și îți poți șterge contul oricând din <em>Profil → Șterge contul</em>, pe web sau în aplicație. Înainte poți descărca datele din <em>Profil → Datele tale</em>.',
      p2: 'Putem suspenda sau închide un cont care încalcă grav sau repetat acești termeni sau atunci când legea o cere. Cu excepția cazului în care ar fi ilegal sau ar pune alte persoane în pericol, îți vom spune mai întâi motivul și îți vom da posibilitatea să îți descarci datele. Dacă vom închide vreodată Chefer, te vom anunța cu cel puțin 30 de zile înainte.',
    },
    responsibility: {
      title: 'Responsabilitatea noastră',
      p1: 'Oferim Chefer cu grija și competența rezonabile. Dincolo de aceasta, și în măsura permisă de lege, nu promitem că va răspunde nevoilor tale specifice.',
      p2: 'Nu răspundem pentru pierderi pe care nu le-am fi putut anticipa în mod rezonabil, care au fost cauzate de propriile tale alegeri (de exemplu, faptul că nu ai verificat o etichetă sau ai ignorat un avertisment medical) sau care sunt cauzate de evenimente aflate în afara controlului nostru.',
      p3: 'Nicio prevedere din acești termeni nu limitează și nu exclude răspunderea noastră pentru deces sau vătămare corporală cauzate de neglijența noastră, pentru fraudă, pentru prejudicii cauzate intenționat sau din neglijență gravă ori orice altă răspundere care nu poate fi limitată conform legii aplicabile. Nicio prevedere din acești termeni nu afectează drepturile tale legale de consumator.',
    },
    law: {
      title: 'Legea aplicabilă și litigii',
      p1: 'Acești termeni sunt guvernați de legea română. Dacă ești consumator și locuiești în UE, păstrezi și protecția normelor imperative din țara în care locuiești și poți introduce o acțiune în instanțele din acea țară, precum și în România. Dacă ceva nu merge bine, te rugăm să ne scrii mai întâi. Majoritatea problemelor se pot rezolva rapid.',
    },
    changes: {
      title: 'Modificări ale acestor termeni',
      p1: 'Putem actualiza acești termeni, de exemplu atunci când adăugăm funcții sau când se schimbă legea. Actualizăm data intrării în vigoare de la început, iar pentru modificările importante te anunțăm în aplicație sau prin email înainte să intre în vigoare. Dacă nu ești de acord cu o modificare, îți poți șterge contul înainte să se aplice.',
    },
    contact: {
      title: 'Contact',
      p1: 'Scrie-ne la {email}, folosește butonul <em>Trimite feedback</em> din aplicație (fiecare mesaj este citit de o persoană) sau vezi {support}.',
    },
  },
  privacy: {
    metaTitle: 'Politica de confidențialitate',
    metaDescription:
      'Ce date colectează Chefer, de ce, cine le prelucrează, cât timp le păstrăm și care sunt drepturile tale.',
    title: 'Politica de confidențialitate',
    effectiveDate: '30 septembrie 2026',
    short: {
      title: 'Pe scurt',
      i1: 'Folosim datele tale ca să ținem Chefer în funcțiune: planurile, rețetele, jurnalele și antrenamentele tale.',
      i2: 'Nu îți vindem niciodată datele și nu afișăm reclame.',
      i3: 'Funcțiile bazate pe IA trimit datele tale unui furnizor de inteligență artificială doar după ce le permiți.',
      i4: 'Analiza utilizării nu folosește cookie-uri și este legată de contul tău doar dacă ești de acord.',
      i5: 'Îți poți descărca datele sau îți poți șterge singur contul, oricând.',
    },
    who: {
      title: 'Cine suntem',
      p1: 'Chefer este administrat de Pop Dan-Vlad, o persoană fizică din România, care este operatorul datelor cu caracter personal descrise aici. În această politică, „noi” înseamnă el. În App Store, aplicația pentru iOS este publicată de Smooth Path Digital S.R.L în numele lui, motiv pentru care Apple afișează această companie drept vânzător. Smooth Path Digital S.R.L nu primește și nu prelucrează datele contului tău Chefer. Pentru orice legat de datele tale, scrie la {email}. Chefer nu are un responsabil cu protecția datelor, așa că scrie la aceeași adresă.',
    },
    collect: {
      title: 'Ce colectăm și de ce',
      intro: 'Pentru fiecare tip de date: ce este, pentru ce îl folosim și temeiul legal.',
      i1: '<strong>Contul tău</strong>: nume, adresă de email și parolă (stocată doar sub formă de hash securizat). Folosite ca să te conectăm, să trimitem emailuri legate de cont (confirmarea adresei, resetarea parolei) și să îți ținem contul în siguranță. Temei: contractul dintre noi.',
      i2: '<strong>Ce introduci în aplicație</strong>: preferințe alimentare, ingrediente care nu îți plac, obiective, planuri de mese, rețete și fotografiile pe care le adaugi, liste de cumpărături, produse din cămară, jurnale alimentare, membri ai gospodăriei, unități de măsură și o adresă de livrare opțională. Folosite ca să îți oferim funcțiile pe care le ceri. Temei: contractul dintre noi.',
      i3: '<strong>Date legate de sănătate</strong>: vezi secțiunea următoare.',
      i4: '<strong>Emailuri săptămânale</strong>: un email de luni, „săptămâna ta este gata”, și un rezumat de duminică, trimise la adresa ta confirmată. Temei: interesul nostru legitim de a te ajuta să folosești planul făcut de tine. Poți dezactiva fiecare email din Preferințe sau cu linkul de dezabonare din email.',
      i5: '<strong>Feedback</strong>-ul trimis cu <em>Trimite feedback</em>, împreună cu pagina pe care te aflai. Folosit ca să reparăm și să îmbunătățim Chefer. Temei: interes legitim.',
      i6: '<strong>Date de securitate și de erori</strong>: adresa IP, tipul de browser sau de dispozitiv și detalii tehnice despre cereri și erori. Folosite ca să ținem Chefer în funcțiune, să oprim abuzurile (de exemplu prin limite la încercările de conectare) și să reparăm blocările. Temei: interesul nostru legitim pentru un serviciu sigur și funcțional.',
      i7: '<strong>Analiza utilizării</strong>: ce pagini și funcții sunt folosite. Temei: interes legitim pentru numărători anonime și consimțământul tău pentru analizele legate de cont. Vezi {analytics}.',
      analyticsLink: 'Cookie-uri și analiză',
      outro:
        'Ca să creezi un cont avem nevoie de nume, email și o parolă. Tot restul depinde de tine, dar unele funcții nu pot merge fără aceste date: obiectivele de calorii, de exemplu, au nevoie de măsurătorile tale corporale.',
    },
    health: {
      title: 'Date legate de sănătate',
      p1: 'Unele dintre informațiile pe care le poți introduce spun ceva despre sănătatea ta: măsurători corporale (vârstă, sex, înălțime, greutate și istoricul greutății), obiective și ținte de calorii, alergii și restricții alimentare, mesele pe care le înregistrezi, antrenamentele, istoricul antrenamentelor și pauzele de la antrenament. Detaliile despre membrii gospodăriei pe care îi adaugi, cum ar fi alergiile lor, pot fi și ele legate de sănătate.',
      p2: 'Conform GDPR, acestea pot fi date din categorii speciale (art. 9), așa că le prelucrăm doar cu consimțământul tău explicit. Toate sunt opționale. Site-ul și aplicația cer acest consimțământ înainte să salvezi prima dată oricare dintre ele, într-o fereastră separată de permisiunea pentru IA de mai jos. Dacă alegi <em>Nu salva</em>, nu se stochează nimic din ele. Îți poți retrage consimțământul oricând: pe site în <em>Profil → Informații despre sănătate</em>, în aplicație în <em>Profil → Confidențialitate și date → Informații despre sănătate</em>, cu <em>Retrage și șterge</em>. Aceasta șterge alergiile, dietele, ingredientele neagreate, obiectivul, măsurătorile și cântăririle stocate pentru tine și gospodăria ta. Poți șterge și intrări individuale sau întregul cont. Retragerea nu afectează ce am făcut cu datele înainte. Dacă aveai deja un cont înainte să existe acest consimțământ, păstrăm ce ai introdus și te întrebăm data viitoare când deschizi aplicația sau site-ul. Folosim datele doar pentru funcțiile pe care le folosești, cum ar fi calcularea obiectivelor, filtrarea rețetelor și planificarea antrenamentelor. Nu le folosim niciodată pentru publicitate.',
      p3: 'Când adaugi un membru al gospodăriei, adaugă doar detalii pe care persoana respectivă este de acord ca tu să le împărtășești.',
    },
    ai: {
      title: 'Prelucrarea cu inteligență artificială',
      p1: 'Generarea planurilor, înlocuirea meselor, scanarea fotografiilor cu mese, importul de rețete, chatul, ordonarea listei de cumpărături cu IA, rezumatul săptămânal și completarea valorilor nutriționale ale unui ingredient trimit datele relevante (preferințele și alergiile tale, obiectivele, măsurătorile corporale și evoluția greutății, fotografia, rețeta, mesajul sau denumirea ingredientului pe care le-ai trimis) unui furnizor de inteligență artificială — în prezent {primary}{backup} — pentru a produce rezultatul. Nu folosim datele tale pentru a antrena modele. Fotografiile pe care le scanezi sau le imporți sunt trimise furnizorului de IA ca să fie citite; nu le stocăm. Când imporți un link video care nu are descriere sau subtitrări, audio-ul lui este transcris de Groq și șters imediat după aceea.',
      backup: {
        one: '; dacă {primaryShort} este ocupat, o cerere poate fi preluată de furnizorul nostru de rezervă, {backups}',
        few: '; dacă {primaryShort} este ocupat, o cerere poate fi preluată de furnizorii noștri de rezervă, {backups}',
        other:
          '; dacă {primaryShort} este ocupat, o cerere poate fi preluată de furnizorii noștri de rezervă, {backups}',
      },
      p2: 'Îți cerem permisiunea înainte ca prima funcție bazată pe IA să trimită ceva și îți spunem ce trimite acea funcție. Dacă alegi <em>Nu acum</em>, nu se trimite nimic. Îți poți retrage permisiunea oricând în <em>Profil → IA și datele tale</em>, pe web sau în aplicație; apoi te întrebăm din nou înainte să ruleze următoarea funcție bazată pe IA. Planul săptămânal și rezumatul săptămânal pe care ți le pregătim automat respectă aceeași alegere: fără permisiunea ta, nu se trimite nimic furnizorului de IA pentru ele. Temei: consimțământul tău (consimțământ explicit pentru orice date legate de sănătate incluse).',
      p3: 'Rezultatele IA și obiectivele calculate de Chefer sunt sugestii automate. Ele nu conduc la decizii cu efecte juridice sau la fel de semnificative asupra ta și le poți oricând schimba sau ignora.',
    },
    camera: {
      title: 'Cameră și fotografii',
      p1: 'Aplicația Chefer folosește camera sau galeria foto doar atunci când alegi să faci sau să atașezi o fotografie, de exemplu ca să scanezi o masă sau să adaugi poza unei rețete. Nu se citește nimic în fundal. Fotografiile pe care le atașezi unei rețete sau unui ingredient sunt stocate pe serverul nostru, ca să le poți vedea.',
    },
    recipients: {
      title: 'Cine primește datele tale',
      intro:
        'Împărtășim date doar cu furnizorii de servicii de mai jos. Ei le prelucrează pentru noi, pe bază de contract, și fiecare primește doar ce îi trebuie.',
      oracle:
        '<strong>Oracle Cloud Infrastructure</strong> găzduiește serverele și baza noastră de date în Frankfurt, Germania (UE).',
      aiPrimary:
        '<strong>{name}</strong> rulează funcțiile bazate pe IA, doar cu permisiunea ta (vezi mai sus). {detail}',
      aiBackup:
        '<strong>{name}</strong> este un furnizor de IA de rezervă, cu aceeași permisiune. {detail}',
      aiGroq:
        '<strong>Groq</strong> transcrie audio-ul unui link video pe care îl imporți, cu aceeași permisiune. {detail}',
      sentry:
        '<strong>Sentry</strong> primește rapoarte de erori și date de performanță de la site și de la serverul nostru. Acestea pot include adresa ta IP, tipul de browser și pagina implicată. Primește și rapoarte de blocare din aplicația Chefer: ce a mers prost, versiunea aplicației, modelul telefonului și sistemul de operare, etichetate cu ID-ul contului tău (nu cu numele sau emailul). Datele sunt stocate în regiunea UE a Sentry (Germania); Sentry este o companie din SUA.',
      posthog:
        '<strong>PostHog</strong> oferă analiza utilizării pentru site și, în versiunile aplicației care au analiza activată, pentru aplicație, stocată în cloud-ul UE al PostHog; PostHog este o companie din SUA. Vezi {analytics}.',
      email:
        '<strong>Furnizorul nostru de email</strong> livrează emailurile legate de cont și emailurile săptămânale, deci primește adresa ta de email și conținutul acestor emailuri. Poate prelucra date în afara UE.',
      expo: '<strong>Expo</strong> livrează actualizările aplicației Chefer. Când aplicația verifică dacă există o actualizare, Expo vede adresa ta IP și detalii tehnice despre aplicație și dispozitiv, dar nu și date ale contului. Statele Unite.',
      images:
        'Imaginile rețetelor sunt create de un serviciu de generare de imagini (în prezent Pollinations) doar pe baza numelui și a bucătăriei rețetei, iar prețurile din supermarket sunt căutate doar după numele ingredientului. Niciunul nu primește nimic despre tine.',
      hosts:
        'Unele imagini și videoclipuri din Chefer se încarcă de pe alte servere: imaginile rețetelor (Unsplash, Pollinations) și miniaturile și videoclipurile exercițiilor (YouTube, în modul cu confidențialitate sporită). Browserul sau aplicația ta contactează atunci direct acel server, care îți vede adresa IP, ca la orice site.',
      stores:
        'Dacă descarci aplicația, Apple (App Store) sau Google (Google Play) se ocupă de descărcare conform propriilor politici de confidențialitate. Putem dezvălui date și atunci când legea o cere, de exemplu unei instanțe sau unei autorități.',
      detail: {
        gemini: 'Poate prelucra date în Statele Unite și în alte țări.',
        groq: 'Statele Unite. Conform contractului de servicii, Groq nu folosește ce îi trimitem pentru a antrena modele.',
        cloudflare:
          'Cloudflare este o companie din SUA și rulează modelele în rețeaua sa globală, așa că o cerere poate fi prelucrată în afara UE. Cloudflare nu folosește ce îi trimitem pentru a antrena modele.',
      },
    },
    transfers: {
      title: 'Transferuri în afara UE',
      p1: 'Serverele și baza noastră de date se află în UE. Unii dintre furnizorii de mai sus au sediul în Statele Unite sau în alte țări din afara Spațiului Economic European ori pot accesa date de acolo. Când se întâmplă asta, ne bazăm pe garanțiile prevăzute de GDPR: decizia de adecvare a Comisiei Europene pentru Cadrul de confidențialitate a datelor UE-SUA, atunci când furnizorul este certificat în baza lui, sau Clauzele contractuale standard ale Comisiei. Scrie-ne pentru mai multe informații despre aceste garanții.',
    },
    retention: {
      title: 'Cât timp păstrăm datele tale',
      i1: '<strong>Contul tău și tot ce conține</strong>: cât timp ai un cont. Când îl ștergi, este eliminat imediat din baza de date activă (vezi mai jos).',
      i2: '<strong>Copiile de siguranță</strong>: baza de date este salvată zilnic. Serverul păstrează ultimele 14 copii zilnice, iar o a doua copie a ultimelor 30 este păstrată pe computerul propriu al administratorului, în caz că serverul se defectează. De aceea, datele șterse dispar din toate copiile de siguranță în aproximativ 30 de zile. Copiile de siguranță sunt folosite doar pentru a restabili serviciul după o defecțiune.',
      i3: '<strong>Sesiunile de conectare</strong> expiră după 30 de zile. Linkurile de resetare a parolei expiră după 1 oră.',
      i4: '<strong>Jurnalele serverului, rapoartele de erori și datele de analiză</strong> sunt păstrate doar cât este necesar pentru securitate, remedierea problemelor și înțelegerea utilizării. Apoi sunt șterse automat, conform setărilor de retenție ale serverului nostru, ale Sentry și ale PostHog.',
    },
    deletion: {
      title: 'Ștergerea contului',
      p1: 'Îți poți șterge singur contul oricând: <em>Profil → Șterge contul</em>, pe web sau în aplicație (confirmi cu parola). Aceasta elimină imediat din baza de date activă contul și tot ce conține: preferințe, planuri, jurnale, rețete, fotografii încărcate, antrenamente, gospodărie și feedback, și te deconectează de pe toate dispozitivele. Rețetele generate pentru tine de IA din Chefer nu conțin date personale; pot rămâne în colecția comună de rețete, fără nicio legătură cu tine. Poți descărca toate datele mai întâi din <em>Profil → Datele tale</em>.',
    },
    rights: {
      title: 'Drepturile tale',
      intro: 'Conform GDPR ai dreptul:',
      i1: 'să îți accesezi datele și să primești o copie (Profil → Datele tale sau scrie-ne);',
      i2: 'să ceri corectarea datelor greșite (poți edita majoritatea lor în aplicație);',
      i3: 'să ceri ștergerea datelor (Profil → Șterge contul sau scrie-ne);',
      i4: 'să primești datele într-un format portabil, care poate fi citit automat (descărcarea este un fișier JSON cu contul, planurile, rețetele, jurnalele, antrenamentele, istoricul consimțămintelor și un jurnal al cererilor către IA făcute pentru tine; antrenamentele pot fi exportate și ca CSV din setările de antrenament);',
      i5: 'să restricționezi în anumite cazuri modul în care îți folosim datele;',
      i6: 'să te opui prelucrării bazate pe interes legitim, cum ar fi emailurile săptămânale sau analiza anonimă;',
      i7: 'să îți retragi oricând orice consimțământ: IA în Profil → IA și datele tale, analiza în Profil → Analiza utilizării, informațiile despre sănătate în Profil → Informații despre sănătate (Retrage și șterge). Aceasta nu afectează ce am făcut înainte.',
      p1: 'Ca să îți exerciți un drept, scrie la {email} de la adresa din contul tău. Răspundem în cel mult o lună. Poți depune și o plângere la o autoritate pentru protecția datelor. În România aceasta este ANSPDCP (Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal), {anspdcp}. Te poți adresa și autorității din țara în care locuiești sau lucrezi.',
    },
    children: {
      title: 'Copii',
      p1: 'Chefer este pentru persoane de 16 ani și peste, vârsta consimțământului digital în România. Nu colectăm cu bună știință date de la persoane mai tinere. Dacă crezi că un copil sub 16 ani are un cont, scrie-ne și îl vom șterge.',
    },
    analytics: {
      title: 'Cookie-uri și analiză',
      p1: '<strong>Cookie-uri.</strong> Site-ul setează doar cookie-urile de care are nevoie ca să funcționeze: sesiunea ta de conectare și unul care ține minte dacă ai folosit ultima dată modul Mâncare sau Sală. Nu folosim cookie-uri publicitare sau de urmărire între site-uri. Site-ul păstrează în stocarea browserului și câteva setări ale tale (de exemplu notițele despre un exercițiu sau alegerea ta privind analiza). Acestea rămân pe dispozitivul tău.',
      p2: '<strong>Analiză.</strong> Site-ul folosește PostHog, găzduit în UE, ca să numere ce pagini și funcții sunt folosite. Nu stochează nimic pe dispozitivul tău: nici cookie-uri, nici stocare locală. Când ești deconectat sau conectat fără să fi acceptat, evenimentele sunt anonime și nelegate de tine sau de contul tău. Dacă activezi <em>Profil → Analiza utilizării</em>, evenimentele sunt legate de ID-ul contului și de planul tău (niciodată de nume sau email), ca să vedem cum este folosit Chefer în timp. Poți dezactiva oricând. Alegerea se aplică browserului în care ai făcut-o. Dacă browserul tău trimite semnalul „Do Not Track”, nu trimitem deloc date de analiză.',
      p3: '<strong>În aplicație.</strong> Aplicația Chefer nu afișează reclame și nu folosește identificatori publicitari. Poate trimite către PostHog (UE) același tip de numărători anonime de utilizare ca site-ul, dar doar în versiunile aplicației care au analiza activată; acolo unde există, <em>Profil → Confidențialitate și date → Analiza utilizării</em> are două comutatoare. „Trimite numărători anonime de utilizare” este activat implicit și trimite numărul de utilizări ale ecranelor și funcțiilor, etichetat cu un identificator aleatoriu generat la fiecare pornire a aplicației și niciodată stocat, fără nume, email sau informații despre sănătate. „Leagă utilizarea de contul meu” este dezactivat dacă nu îl pornești; când este activ, numărătorile pot purta ID-ul contului tău în loc de identificatorul aleatoriu (niciodată numele sau emailul). Dezactivarea primului comutator oprește imediat toate cererile de analiză din aplicație. Alegerea se aplică telefonului pe care ai făcut-o. Aplicația păstrează conectarea în stocarea securizată a dispozitivului și salvează antrenamentele pe dispozitiv până se sincronizează. Mementourile sunt programate pe dispozitivul tău.',
    },
    security: {
      title: 'Securitate',
      p1: 'Tot traficul către Chefer este criptat (HTTPS), parolele sunt stocate doar sub formă de hash securizat, iar accesul la servere este restricționat. Niciun sistem nu este perfect sigur. Dacă o breșă îți pune datele în pericol, te vom anunța pe tine și autoritățile, așa cum cere legea.',
    },
    changes: {
      title: 'Modificări ale acestei politici',
      p1: 'Când modificăm această politică, actualizăm data intrării în vigoare de la început. Pentru modificările importante, cum ar fi o nouă utilizare a datelor tale sau un nou tip de furnizor, te anunțăm în aplicație sau prin email înainte să intre în vigoare și îți cerem din nou consimțământul acolo unde legea o cere.',
    },
    contact: {
      title: 'Contact',
      p1: 'Ai întrebări despre datele tale sau despre această politică? Scrie la {email} sau vezi {support}.',
    },
  },
  support: {
    metaTitle: 'Ajutor și asistență',
    metaDescription:
      'Cum primești ajutor cu Chefer: contact, resetarea parolei, ștergerea contului și IA.',
    title: 'Ajutor și asistență',
    updated: 'Chefer · ultima actualizare: 26 septembrie 2026',
    what: {
      title: 'Ce este Chefer',
      p1: 'Chefer îți planifică o săptămână de mese în funcție de obiectivele și alergiile tale, estimează prețul listei de cumpărături, îți urmărește alimentația și îți planifică antrenamentele de sală. Funcționează pe web și în aplicația Chefer, cu un singur cont pentru ambele.',
    },
    app: {
      title: 'Descarcă aplicația',
      p1: 'Conectează-te cu același cont pe care îl folosești pe web.',
    },
    help: {
      title: 'Primește ajutor',
      i1: 'În aplicație: <em>Trimite feedback</em> (în meniu pe web, la <em>Mai multe</em> în aplicație). Fiecare mesaj este citit de o persoană.',
      i2: 'Pe email: {email}. Include adresa de email cu care te-ai înscris, ca să îți găsim contul.',
    },
    faq: {
      title: 'Întrebări frecvente',
      resetQ: 'Cum îmi resetez parola?',
      resetA:
        'Pe ecranul de conectare, apasă <em>Ai uitat parola?</em> și introdu adresa de email. Îți trimitem un link prin care îți alegi o parolă nouă; expiră după puțin timp, așa că folosește-l curând. Nu ai primit emailul? Verifică folderul de spam sau scrie-ne.',
      deleteQ: 'Cum îmi șterg contul?',
      deleteA:
        'Mergi la <em>Profil → Șterge contul</em>, pe web sau în aplicație. Confirmă cu parola și scrie DELETE. Contul și toate datele lui — preferințe, planuri, jurnale, rețete, antrenamente și gospodărie — sunt eliminate imediat, iar tu ești deconectat de pe toate dispozitivele. Acțiunea nu poate fi anulată. Vrei o copie mai întâi? Folosește <em>Profil → Datele tale → Descarcă datele mele</em>. Vezi {privacy} pentru cât timp mai păstrează o copie copiile de siguranță.',
      deletePrivacyLink: 'politica de confidențialitate',
      aiQ: 'Cum folosește Chefer inteligența artificială?',
      aiA: 'Planurile de mese și înlocuirile Premium, scanarea fotografiilor cu mese, importul de rețete, chatul cu bucătarul IA și ordonarea listei de cumpărături cu IA trimit datele de care are nevoie fiecare (de exemplu preferințele și alergiile tale, obiectivele și măsurătorile corporale sau fotografia ori mesajul trimis) către {providers}, pentru a produce rezultatul. Îți cerem permisiunea înainte să ruleze prima dintre ele și o poți dezactiva oricând în <em>Profil → IA și datele tale</em>. Datele tale nu sunt folosite pentru a antrena modele de IA. Rezultatele IA pot fi greșite — verifică întotdeauna ingredientele în funcție de alergiile tale.',
      premiumQ: 'Este Premium gratuit?',
      premiumA:
        'Da. Toate funcțiile Premium sunt gratuite, iar Chefer nu cere niciodată datele de plată.',
    },
  },
  providers: {
    listJoin: '{head} și {last}',
  },
  appErrors: {
    webTitle: 'Ceva nu a mers bine',
    webBody:
      'A apărut o eroare neașteptată. Încearcă din nou, iar dacă problema persistă, contactează asistența.',
    errorId: 'ID eroare: {id}',
    tryAgain: 'Încearcă din nou',
    goHome: 'Acasă',
    notFoundMeta: '404 — Pagina nu a fost găsită',
    notFoundCode: 'Eroare 404',
    notFoundTitle: 'Pagina nu a fost găsită',
    notFoundBody:
      'Ne pare rău, nu am găsit pagina pe care o cauți. Poate a fost mutată, ștearsă sau nu a existat niciodată.',
    returnHome: 'Înapoi acasă',
    goToDashboard: 'Mergi la panou',
    appTitle: 'Ceva nu a mers bine',
    appBody:
      'Acest ecran a întâmpinat o eroare neașteptată. Nu s-a pierdut nimic din ce ai salvat.',
    reportSent: 'Mulțumim. Am primit raportul tău.',
    reportThis: 'Raportează',
    reportLabel: 'Spune-ne ce făceai',
    reportFailed:
      'Nu am putut trimite raportul. Verifică conexiunea și contul, apoi încearcă din nou.',
    sendReport: 'Trimite raportul',
  },
  app: {
    screenTitle: 'Informații juridice',
    notFoundTitle: 'Nu am găsit pagina',
    notFoundBody: 'Aici se află Termenii de utilizare și Politica de confidențialitate.',
    readTerms: 'Citește Termenii de utilizare',
    readPrivacy: 'Citește Politica de confidențialitate',
    loadError: 'Nu am putut încărca pagina. Verifică conexiunea și încearcă din nou.',
  },
};
