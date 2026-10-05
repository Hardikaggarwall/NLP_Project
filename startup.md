# Manual startup

These steps run Clause AI locally without PostgreSQL or Docker. The API uses
temporary in-memory storage, so uploaded files and analysis are cleared when the
API stops.

## One-time setup

Install Node.js 22 LTS or newer, then open PowerShell in the project folder and
install the dependencies:

```powershell
Set-Location "C:\Users\sanje\Desktop\NLP_project\clause.ai"
npm install
npm run build:constants
```

## Start the project manually

Open two PowerShell terminals. In each, change to the project folder:

```powershell
Set-Location "C:\Users\sanje\Desktop\NLP_project\clause.ai"
```

In the first terminal, start the API:

```powershell
npm run dev --workspace=@clause-ai/api
```

In the second terminal, start the web app:

```powershell
npm run dev --workspace=@clause-ai/web
```

Open **http://localhost:5173** in your browser. The API runs at
**http://localhost:4000**.

To stop either service, press `Ctrl+C` in its terminal. Do not run database
migration or setup commands for this in-memory mode.

## Start both services with one command

From the project folder, you can also launch the API and web app together:

```powershell
npm run dev
```

Press `Ctrl+C` to stop both services.
