# Branch

Editor web per scrivere senza perdere le alternative, basato sul prototipo HTML Branch fornito dall’utente. Le viste Testo, Mappa e Markdown condividono lo stesso documento.

## Avvio e distribuzione

Richiede Node.js 22.12+ (verificato con Node 24).

```sh
npm ci
npm run dev
```

Aprire l’indirizzo mostrato da Vite. Per la distribuzione statica:

```sh
npm test
npm run build
```

Pubblicare `dist/` su un hosting statico HTTPS. Nel checkout ospitato, `.openai/hosting.json` mantiene l’identità del Site esistente. Lo ZIP dei sorgenti non include questa identità e può essere usato indipendentemente.

## Scrittura

- Testo centrale continuo con CodeMirror 6, selezioni, incolla, ricerca e annulla/ripeti. Il titolo modificabile è accanto a Branch, con lo stato di salvataggio sotto. La barra superiore resta visibile durante lo scroll; una barra strumenti di 44 px contiene un solo comando Indice a sinistra, le Note a destra e i comandi grassetto, corsivo, sottolineato (`<u>`), elenco puntato ed elenco numerato. La formattazione conserva gli ID e le note dei paragrafi anche nelle selezioni multiple.
- In modalità Testo, anteprima Markdown nel paragrafo: delimitatori e destinazioni dei link si mostrano solo nel paragrafo che contiene il cursore o la selezione. La sorgente salvata resta invariata; codice ed escape mantengono il contenuto letterale. Cinque livelli di titoli H1–H5, selezionabili dalla barra, con dimensioni distinte; gli H6 preesistenti restano compatibili. Gli elenchi puntati e numerati hanno rientro sporgente anche sulle righe a capo, sulle continuazioni e nei sottoelenchi.
- Paragrafi con identità stabile, varianti sinistre/destre e note. I blocchi Markdown sono delimitati dalle righe vuote; i blocchi di codice recintati rimangono integri.
- Le frecce a sinistra/destra di ogni paragrafo (oppure Alt ←/→) scambiano il tronco con il ramo visibile su quel lato. Se il lato è vuoto, mettono il testo da parte lasciando uno spazio vuoto; se il tronco è vuoto lo riempiono con il ramo. Un clic sul testo di una variante la scambia con il tronco; la piccola freccia sulla scheda apre la modifica e l’eliminazione. Gli scambi in modalità Testo mostrano un’animazione bidirezionale; con `prefers-reduced-motion` l’operazione è immediata. L’intera operazione è una sola voce della cronologia.
- I titoli non offrono comandi per creare rami, né in Testo né in Mappa (incluse scorciatoie e rilascio di riquadri). Eventuali varianti preesistenti dei titoli vengono conservate, esportate e restano modificabili/scambiabili.
- Lo switch **Rami**, accanto alle modalità, mostra o nasconde colonne laterali, frecce e barra verticale del tronco nella sola modalità Testo. La scelta è persistente nel browser e non modifica testo, allegati, larghezza del tronco o cronologia. La Mappa continua a mostrare tutte le varianti.
- In Mappa, i riquadri dei paragrafi e delle varianti mostrano le prime 10 parole e sottili linee decorative per il seguito; i testi di dieci parole o meno non aggiungono linee. Titoli leggibili per intero; modifica, trascinamento e scambio usano sempre il testo completo.
- In Mappa, le frecce laterali dei paragrafi spostano il testo su un lato vuoto o lo scambiano con il ramo attualmente visibile su quel lato. Un tronco vuoto può recuperare il ramo. Titoli esclusi; testo completo e note conservati, operazione annullabile. I comandi sono disponibili anche quando lo switch Rami della modalità Testo è spento.
- I riquadri dei paragrafi in Mappa hanno altezza determinata dal contenuto e comandi subito sotto l’anteprima. Le frecce ↑/↓ accompagnano il riordino e lo scorrimento con un’animazione di 280 ms, centrano il riquadro spostato sotto la barra fissa e conservano il focus sul comando. L’animazione rispetta il movimento ridotto e si interrompe su annullamento, cambio vista, ridimensionamento o scorrimento manuale; entrando in una sezione compressa, la sezione viene aperta per non perdere il paragrafo.
- Mappa con trascinamento e frecce per riordinare. I titoli si spostano con la loro sezione. Le sezioni sono comprimibili. I titoli H1–H6 hanno altezza ridotta e larghezze progressivamente minori; i paragrafi sono più stretti dei titoli. Le linee di collegamento mostrano la gerarchia delle sezioni.
- Vista Markdown in sola lettura del testo principale con richiami alle note e definizioni in fondo al documento. Vista, copia ed esportazione `.md` usano lo stesso contenuto; la sorgente del tronco rimane invariata.
- Libreria documenti, indice, cerca/sostituisci, note e sei temi. Inter è il carattere fisso dell’interfaccia, distribuito con il sito senza richieste a CDN. I comandi Serif / Sans / Mono e la dimensione modificano solo il testo di tronco e rami (anche nei relativi editor). Il Mono usa un fattore 0,82 per bilanciare le dimensioni percepite. Note e controlli mantengono il carattere dell’interfaccia.
- In modalità Testo, i riquadri dei rami hanno l’altezza effettiva del paragrafo centrale, compresi blocchi multilinea e testo a capo. Le varianti lunghe scorrono nel proprio riquadro. Impostazioni consente di scegliere una larghezza del tronco dal 42% al 68% sui dispositivi con spazio per le colonne laterali; la scelta è conservata nel browser.
- Su telefono il testo occupa tutta la colonna e le varianti del paragrafo selezionato si aprono con Rami. In Mappa le frecce consentono il riordino senza trascinamento.

La cronologia CodeMirror include anche le operazioni sulle varianti, sulle note e sulla struttura. La cronologia di sessione è conservata passando tra documenti, ma non dopo il ricaricamento.

Quando si divide un paragrafo gli allegati restano sulla prima parte; quando si uniscono paragrafi i relativi allegati si uniscono. I paragrafi completamente eliminati con varianti o note vengono conservati in “Fuori dal testo”, nel pannello Note, e possono essere ripristinati.

## Struttura del codice

- `src/main.js`: avvio e coordinamento dell’app, preferenze, comandi del documento e interazione dei rami nella vista Testo.
- `src/storage.js`: apertura e migrazione di IndexedDB, selezione del documento, autosalvataggio, coda delle scritture, stato di salvataggio ed eventi di chiusura/visibilità. Il modulo comunica con l’interfaccia tramite callback ed è verificabile con un archivio simulato.
- `src/editor.js`: configurazione CodeMirror, campi condivisi dei blocchi, decorazioni degli spazi vuoti e delle animazioni, scorciatoie e cronologia unificata. Gli aggiornamenti vengono comunicati al coordinatore tramite callback.
- `src/map-view.js`: rendering della Mappa, sezioni compresse, trascinamento, frecce, focus e animazione del riordino.
- `src/panels.js`: libreria, indice, ricerca, note, varianti su telefono e dialoghi di modifica.
- `src/dom.js`: piccole funzioni condivise per elementi, pulsanti, icone e anteprime della Mappa.
- `src/model.js`: operazioni pure sul documento e sui formati; `markdown-plan.js` e `live-preview.js` gestiscono la presentazione Markdown; `motion.js` le animazioni temporanee.
- `src/style.css`: punto d’ingresso degli stili. `src/styles/` raccoglie regole di base, barra e layout, schede delle varianti, editor, mappa e pannelli. Ogni file riunisce le regole base e le rispettive varianti responsive, senza aggiungere correzioni in fondo al foglio generale. Le schede condivise vengono importate prima delle personalizzazioni Testo e Mappa.

I moduli non importano `main.js`: ricevono dati e azioni con funzioni esplicite. L’estrazione conserva nome del database, chiavi delle preferenze, formato dei backup, ID dei blocchi e comportamento dell’app.

## Dati e formati

I dati sono locali a questo browser e all’origine del sito. Il database IndexedDB mantiene il nome interno `tasto-web` e il Site mantiene l’indirizzo precedente, per conservare i documenti della prima versione. Il codice migra i documenti esistenti senza modificare la sorgente Markdown. Il nome del prodotto e del pacchetto è Branch.

- `.md`: esporta il testo principale con le note come footnote Markdown (`[^branch-n]`), in ordine di documento. Le note multilinea vengono indentate; le note dei paragrafi rimossi sono indicate separatamente in fondo. Le varianti non vengono incluse. Le etichette già presenti nel testo sono rispettate.
- `.branch.json`: esporta testo, ID dei paragrafi, posizioni, varianti, note e contenuti fuori dal testo; può essere reimportato come un nuovo documento.
- Importazione di `.md`, `.markdown`, `.txt` e backup `.branch.json` (massimo 5 MB per file).

Il salvataggio avviene dopo 450 ms di inattività e quando la scheda perde visibilità. Gli errori sono segnalati e il testo in memoria rimane esportabile. Cancellare i dati del sito elimina l’archivio: esportare copie complete. Non è presente sincronizzazione fra browser o dispositivi, né gestione dei conflitti fra schede aperte contemporaneamente. Non è ancora una PWA con funzionamento offline garantito.

## Verifica

`npm test` esegue 49 controlli su parsing Markdown, offset, conservazione degli allegati durante modifiche/divisioni/unioni e formattazione, archivio dei contenuti eliminati, spostamento delle sezioni, scambio delle varianti, comandi di formattazione, import/export completo e migrazione. I controlli aggiuntivi coprono i moduli estratti di salvataggio ed editor: salvataggi accodati, snapshot immutabili, errori e tentativi successivi, cambio documento, eventi di chiusura e annullamento delle operazioni strutturali.

Eseguita inoltre verifica in Chromium desktop e telefono: scambio, cronologia unificata, persistenza dopo ricaricamento, trascinamento, riordino con pulsanti, export/import completo, recupero dei contenuti eliminati, temi e migrazione. Nessun errore runtime osservato. Durante il riordino dei moduli sono stati confrontati gli stili calcolati prima/dopo in 119 combinazioni di vista e pannello su 17 larghezze, da 320 a 1600 px, comprese le soglie responsive, senza differenze. Verificati anche anteprima Markdown al cambio del cursore, selettore H1–H5 con annullamento, allineamento delle righe degli elenchi e assenza della barra a rami nascosti. Verificati inoltre il font fisso dell’interfaccia, la compensazione del Mono, le larghezze H1–H6, la gerarchia della Mappa, l’esportazione delle note e il download dei sorgenti. Verificati anche selezioni della barra di formattazione, persistenza della larghezza, parità delle altezze, scambi animati bidirezionali, annullamento durante l’animazione, accesso al ramo visibile, barra fissa su desktop/telefono e preferenza di movimento ridotto. Verificati lo switch persistente su desktop/telefono, l’assenza di modifiche ai documenti nascondendo i rami, il blocco dei nuovi rami sui titoli e la conservazione delle varianti dei titoli già esistenti.

## Recuperare il codice

Nel sito: **Impostazioni → Scarica codice sorgente (.zip)**. Il collegamento scarica `/downloads/branch-source.zip`.

Lo ZIP contiene `src/`, `tests/`, `scripts/`, `index.html`, `package.json`, `package-lock.json`, `.gitignore` e questo README. Dopo averlo estratto, aprire un terminale nella cartella `branch/` ed eseguire `npm ci` e `npm run dev`.

`npm run build` rigenera automaticamente lo ZIP dalla stessa versione dei sorgenti usata per produrre il sito. Il pacchetto esclude documenti locali, credenziali, cronologia Git e configurazione privata dell’hosting. Non contiene `node_modules`: le dipendenze si installano con `npm ci`.
