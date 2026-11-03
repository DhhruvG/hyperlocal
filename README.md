# LocalPrice

LocalPrice is a React frontend with a FastAPI backend and MongoDB storage.

## Run on Windows Terminal

Prerequisites:

- Windows 10 or 11
- Python 3.11 or newer
- Node.js 20 or newer
- MongoDB Community Server running on `mongodb://localhost:27017`

From the project folder in PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\setup-windows.ps1
.\run-windows.ps1
```

The setup script creates the Python virtual environment, installs backend packages, creates local environment files, and installs frontend packages. The run script opens the backend at `http://localhost:8000` and the frontend at `http://localhost:3000`.

To stop the application, close the two PowerShell windows opened by `run-windows.ps1`.

## Manual commands

Backend:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn server:app --host 0.0.0.0 --port 8000
```

Frontend, in a second terminal:

```powershell
cd frontend
yarn start
```

The default administrator credentials are documented in `memory/test_credentials.md`.
# Here are your Instructions
