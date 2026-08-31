# Písmo TeleNeo

TeleNeo je proprietární písmo Deutsche Telekom a z licenčních důvodů není
součástí repozitáře. Vložte sem soubory rodiny **TeleNeo / TeleNeo Office**
(k dispozici na brand portálu Telekomu; TTF verze bývá v zipu „TeleNeo
Office"). CSS hledá tyto názvy:

- `TeleNeo-Regular.woff2` **nebo** `TeleNeoOffice-Regular.ttf`
- `TeleNeo-Bold.woff2` **nebo** `TeleNeoOffice-Bold.ttf`
- `TeleNeo-ExtraBold.woff2` **nebo** `TeleNeoOffice-ExtraBold.ttf`

Deklarace `@font-face` v `app/globals.css` je načtou automaticky (přednost
má lokálně nainstalované písmo, pak woff2, pak ttf). Dokud tu soubory
nejsou, použije se systémové bezpatkové písmo.
