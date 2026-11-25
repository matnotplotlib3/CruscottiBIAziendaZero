# Cruscotti BI · Azienda Zero

Demo **solo BI** per la Governance degli Accreditamenti. Comprende un portale web locale, un backend Node.js, 14 CSV sintetici e una dashboard Amazon QuickSight incorporabile. La self-BI è sviluppata separatamente. Lo stesso server offre due versioni della demo: quella completa e quella dedicata a QuickSight.

## Cosa si può mostrare

Il menu presenta cinque cruscotti: **Control Tower**, **Strutture e titoli**, **Autorizzazione**, **Accreditamento**, **Visite e valutatori**. Ogni area usa una composizione adatta al dominio: priorità SLA, copertura territoriale e titoli, flusso delle istruttorie, pareri e rinnovi, agenda visite e capacità dei valutatori.

Nei fogli QuickSight, **Control Tower** mostra la composizione del rischio SLA con una treemap e le scadenze nel tempo; **Strutture** affianca una mappa delle province, una mappa puntuale delle sedi, la distribuzione per ULSS e una torta dello stato dei titoli; **Autorizzazione** mostra un Sankey priorità → fase e i tempi per ufficio; **Accreditamento** mostra un Sankey tipo richiesta → stato attuale e la matrice dei pareri; **Visite** usa una heatmap tipo × mese e una ciambella per la gravità delle non conformità; **La mia scrivania** mette in primo piano le attività e una heatmap delle scadenze per settimana e priorità. I Sankey descrivono relazioni nello stato corrente, non una cronologia di transizioni. Tutte le tabelle hanno intestazioni blu scuro, righe alternate e larghezze dedicate; le colonne di stato e priorità pertinenti hanno colori condizionali.

La vista geografica contiene una riga per ciascuna delle **72 sedi sintetiche**, distribuite nelle sette province del Veneto e nove ULSS. Selezionare una provincia sulla mappa colorata filtra pin, distribuzione ULSS ed elenco sedi; selezionare una ULSS filtra le due mappe e l'elenco. Sono disponibili anche filtri di foglio per provincia, ULSS, tipologia e struttura. Le coordinate dei pin sono approssimazioni dimostrative del comune e non indicano indirizzi reali. Le ULSS non sono poligoni geografici standard: la loro distribuzione è mostrata come treemap, non come confini sulla mappa. I KPI e le tabelle dei titoli derivano da altri dataset e non sono filtrati dalla selezione di una provincia o ULSS sulla mappa.

**La mia scrivania** è un'area operativa trasversale. Nella demo completa è una pagina del portale che mostra azioni e scadenze assegnate a un profilo sintetico, con accesso al dettaglio della pratica. Nella versione QuickSight è un sesto foglio della dashboard, con indicatori, elenco delle attività e filtri per profilo, tipo e stato. I filtri servono alla dimostrazione: non autenticano gli utenti né limitano i dati per identità. In produzione il perimetro personale richiede autorizzazioni backend o RLS.

| Modalità | Origine dei dati | Funzioni |
| --- | --- | --- |
| **Dati demo** | CSV sintetici in `data/`, elaborati dal backend locale | KPI, filtri territoriali e per tipologia, grafici, dettaglio dei record, esportazione CSV |
| **QuickSight** | Gli stessi domini caricati come dataset QuickSight in SPICE | Dashboard AWS privata con sei fogli, inclusa la scrivania sintetica, layout diversi e controlli di filtro nella parte superiore dei fogli, mostrata nel portale tramite l'Embedding SDK |

I filtri delle due modalità non sono sincronizzati. In QuickSight i controlli sono configurati su tutti i visual del foglio e, dove un foglio usa più dataset, su tutti quelli che espongono la chiave condivisa: pratica, struttura, richiesta o visita. Control Tower e Autorizzazione offrono anche filtri per stato/tipologia o fase/ufficio. Un filtro territoriale comune a *tutti* i visual QuickSight richiederà l'esposizione coerente di ULSS anche nelle viste di dettaglio oggi prive di tale campo. **Dati demo** funziona senza AWS; **QuickSight** richiede connessione internet, accesso SSO valido e una dashboard pubblicata nell'account.

La versione **solo QuickSight** si apre da `/quicksight-only.html`: non espone la modalità Dati demo. La demo completa rimane su `/` e mantiene la sua scrivania locale. Le due versioni condividono backend, configurazione AWS e dashboard QuickSight; non occorre caricare nuovamente i dataset. La versione solo QuickSight applica tramite l'Embedding SDK una palette e uno stile dei riquadri coerenti con il portale; il tema si applica solo alla vista incorporata e non modifica la dashboard nell'account AWS.

Le date visibili nel portale e nei visual QuickSight sono in formato `gg/mm/aaaa`. I CSV esportati conservano le date originali in formato ISO per facilitarne l'elaborazione.

## Architettura

```text
Browser ──> portale HTML/CSS/JS ──> server Node.js su 127.0.0.1:4173
                                      ├── CSV sintetici (modalità Dati demo)
                                      └── AWS CLI ──> URL temporaneo QuickSight
                                                       └── dashboard privata incorporata
```

Il backend genera l'URL incorporabile solo quando si apre QuickSight. Non salva password, chiavi AWS o URL temporanei su disco. Il client QuickSight ufficiale, incluso in `web/vendor/`, seleziona il foglio richiesto dal menu senza aprire una nuova sessione a ogni cambio di area.

## Avvio locale

**Requisito per la modalità Dati demo:** Node.js 20 o successivo. Non occorrono `npm`, Docker o servizi AWS.

```powershell
git clone https://github.com/matnotplotlib3/CruscottiBIAziendaZero.git
cd CruscottiBIAziendaZero
node server.mjs
```

Aprire [http://localhost:4173](http://localhost:4173) per la **demo completa** oppure [http://localhost:4173/quicksight-only.html](http://localhost:4173/quicksight-only.html) per la **versione solo QuickSight**. Tenere aperto il terminale durante la presentazione; `Ctrl+C` arresta il server. Dopo un aggiornamento del codice o di `config.local.json`, arrestare e riavviare il server. Il server accetta connessioni solo da `127.0.0.1`, quindi per mostrare la demo da remoto serve la condivisione schermo.

Se Node.js è stato installato con `fnm` ma una nuova finestra PowerShell non riconosce `node`, si può avviare la versione predefinita direttamente, senza cambiare il `PATH`:

```powershell
& "$env:APPDATA\fnm\aliases\default\node.exe" server.mjs
```

Se la porta `4173` è già occupata, arrestare prima il precedente server della demo con `Ctrl+C` nel terminale in cui è in esecuzione.

### Attivare anche la modalità QuickSight

Servono AWS CLI v2, un profilo AWS IAM Identity Center/SSO, un utente QuickSight registrato con accesso alla dashboard privata e il permesso IAM `quicksight:GenerateEmbedUrlForRegisteredUser`.

1. Copiare `config.example.json` in **`config.local.json`**. Il file locale è ignorato da Git.
2. Compilare `accountId`, `userArn`, `awsProfile` e `awsCliPath`. Inserire l'ID della **stessa dashboard** nelle sei voci di `dashboards`; i sei ID di `sheets` sono già impostati per la dashboard generata dagli script di questa repo. `analysisId` serve solo se si rigenera la definizione QuickSight.
3. Autenticarsi con `aws sso login --profile NOME_PROFILO` e completare l'accesso nel browser. Se `aws.exe` non è nel `PATH`, usare il suo percorso completo.
4. Avviare `node server.mjs`, poi aprire direttamente `http://localhost:4173/quicksight-only.html`. Nella demo completa si può ancora selezionare **QuickSight** dai cinque cruscotti BI.

Il backend chiama `GenerateEmbedUrlForRegisteredUser` con il dominio consentito `http://localhost:4173` e una sessione di 60 minuti. L'URL temporaneo viene restituito solo alla pagina locale con `Cache-Control: no-store`. Se l'SSO scade, ripetere il login e ricaricare il portale.

Per distribuire il portale a più utenti servono hosting HTTPS, autenticazione, autorizzazioni per ciascun utente e un dominio di embedding appropriato. Il server locale non è configurato per l'esposizione pubblica.

## Rigenerare la definizione QuickSight

I 14 CSV devono essere già caricati come dataset nell'account QuickSight, compreso `vw_bi_strutture_sedi_geografia_mock_20261125.csv`. Dopo aver compilato `config.local.json`, eseguire:

```powershell
node quicksight/snapshot-schemas.mjs
node quicksight/build-definition.mjs
```

Il primo script legge via AWS CLI gli ID e le colonne dei dataset, usando l'analisi indicata in `analysisId` per risolvere eventuali dataset con lo stesso nome. Se serve, specificare l'ID corretto in `datasetIds` della configurazione locale. Il secondo genera la definizione a sei fogli e i JSON per `update-analysis`, `create-dashboard` o `update-dashboard`. I JSON generati sono esclusi da Git perché contengono ARN specifici dell'account.

Per le mappe delle sedi, assegnare i ruoli geografici a paese, regione, provincia, comune, latitudine e longitudine prima di pubblicare la definizione. Lo script seguente legge e salva una copia della configurazione completa del dataset e prepara la richiesta di aggiornamento:

```powershell
node quicksight/prepare-geo-role.mjs sedi
aws quicksight update-data-set --cli-input-json file://quicksight/sedi-geo.request.json --region eu-central-1 --profile NOME_PROFILO
```

`update-data-set` avvia una nuova ingestione del dataset SPICE esistente. Verificarne l'esito con `describe-ingestion` prima della pubblicazione. Il precedente profilo `structures` dello script resta disponibile per assegnare il ruolo **CITY** a `comune_principale` del dataset anagrafico, se serve ad altri visual. Non assegnare un ruolo geografico a `ulss_nome`: ULSS è una classificazione amministrativa, non una posizione sulla mappa.

Per la prima pubblicazione usare `create-dashboard.request.json`. Per una dashboard esistente usare `update-dashboard.request.json`, poi rendere pubblicata la nuova versione con `update-dashboard-published-version`. Queste operazioni si eseguono con la AWS CLI nel profilo autorizzato; consultare la [documentazione AWS QuickSight CLI](https://docs.aws.amazon.com/cli/latest/reference/quicksight/).

## Test e file principali

```powershell
node --test
```

- `server.mjs`: API locali e generazione dell'URL di embedding.
- `lib/data.mjs`: lettura CSV e calcolo delle viste.
- `web/`: frontend responsive e QuickSight Embedding SDK.
- `web/quicksight-only.html`: ingresso alla versione con soli fogli QuickSight.
- `data/`: 14 dataset esclusivamente sintetici, compresa la vista geografica delle sedi.
- `quicksight/`: generazione della definizione dell'analisi e della dashboard.
- `quicksight/prepare-geo-role.mjs`: richieste riproducibili per i ruoli geografici dei dataset strutture e sedi.
- `config.example.json`: struttura della configurazione; **non** contiene credenziali.

L'Embedding SDK vendorizzato è la versione 2.12.1 del progetto [Amazon QuickSight Embedding SDK](https://github.com/awslabs/amazon-quicksight-embedding-sdk), con licenza Apache-2.0 e avviso in `web/vendor/`.

## Limiti della demo

Le soglie SLA e le definizioni funzionali dei KPI sono dimostrative e vanno validate con il cliente prima di collegare dati reali. I dataset caricati come file usano SPICE: quote e costi dipendono dalla configurazione dell'account AWS; consultare la [pagina prezzi QuickSight](https://aws.amazon.com/quick/quicksight/pricing/).
