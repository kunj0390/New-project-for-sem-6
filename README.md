# MediPulse — Hospital Resource Monitoring System

A real-time monitoring and AI-powered predictive framework for hospital bed and oxygen supply management.

---

## Project Structure

```
hospital-monitoring-system/
│
├── backend/
│   ├── app.py          ← Flask REST API
│   ├── model.py        ← AI prediction engine (Random Forest)
│   ├── dataset.csv     ← 70-day historical training data
│   └── models/         ← Auto-created: saved .pkl model files
│
├── frontend/
│   ├── index.html      ← Dashboard UI
│   ├── style.css       ← Dark medical theme styles
│   └── script.js       ← Chart.js + API integration
│
├── requirements.txt    ← Python dependencies
└── README.md
```

---

## Tech Stack

| Layer      | Technology                    |
|------------|-------------------------------|
| Frontend   | HTML5, CSS3, JavaScript (ES6) |
| Charts     | Chart.js 4                    |
| Backend    | Python 3.9+ / Flask           |
| Database   | SQLite (auto-created)         |
| AI/ML      | scikit-learn (Random Forest)  |
| API Style  | REST / JSON                   |

---

## Quick Start

### 1. Clone or download the project

```bash
git clone <your-repo-url>
cd hospital-monitoring-system
```

### 2. Set up Python environment

```bash
# Create virtual environment (recommended)
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Start the backend

For easiest repeatable workflow on Windows:
```powershell
./setup.ps1    # create venv + install deps
./run.ps1      # activate venv + start app.py
```

Or via batch wrapper:
```cmd
run.bat
```

(If you prefer manual):
```bash
python app.py
```

You should see:
```
[DB] Database initialized.
[API] Starting Hospital Monitoring API on http://localhost:5000
```

The first time you call `/predictDemand`, the AI models will auto-train (~5 seconds).

### 5. Open the frontend

Open `frontend/index.html` directly in your browser.

> **Tip:** For the best experience, use VS Code with the Live Server extension,
> or run: `python -m http.server 8080` from the `frontend/` directory.

---

## API Endpoints

| Method | Endpoint           | Description                          |
|--------|--------------------|--------------------------------------|
| GET    | `/getHospitalData` | Current resource snapshot + alerts   |
| POST   | `/updateResources` | Manually update resource values      |
| GET    | `/predictDemand`   | AI 24-hour demand forecast           |
| GET    | `/historicalTrends`| Last 30 days of historical data      |
| GET    | `/alerts`          | Alert log (last 20 records)          |
| GET    | `/trainModel`      | Re-train AI models on latest data    |

### Example: Update oxygen stock

```bash
curl -X POST http://localhost:5000/updateResources \
  -H "Content-Type: application/json" \
  -d '{"oxygen_stock": 420, "available_beds": 75}'
```

---

## AI Model Details

- **Algorithm:** Random Forest Regressor (100 trees, max depth 10)
- **Features:** Day of week, day of month, month, week of year, current resource values,
  3-day lag features, 7-day rolling averages
- **Targets:**
  - `beds_model` → beds needed in 24h
  - `oxygen_model` → oxygen consumption in 24h
  - `icu_model` → ICU beds needed in 24h
- **Split:** 80% train / 20% test
- **Metric:** Mean Absolute Error (MAE)

To re-train after adding new data to `dataset.csv`:
```
GET http://localhost:5000/trainModel
```

---

## Dataset Format

Add rows to `backend/dataset.csv` to improve model accuracy:

```
date,patients_admitted,beds_used,icu_beds_used,oxygen_used,ventilators_used
2024-03-11,85,174,33,139,24
```

---

## Alert Thresholds

| Resource   | Warning              | Critical             |
|------------|----------------------|----------------------|
| Oxygen     | < 130% of threshold  | Below threshold (100)|
| Beds       | < 10% available      | 0 available          |
| ICU Beds   | ≤ 3 available        | —                    |

---

## Troubleshooting

**CORS error in browser console:**
Make sure the Flask backend is running on port 5000. `flask-cors` is installed and enabled.

**Models not found:**
The models auto-train on first `/predictDemand` call. You can also run:
```bash
cd backend && python model.py
```

**Charts not loading:**
Check browser console. Ensure the backend is running and CORS is not blocked.

---

## License
MIT — free to use for educational and commercial purposes.
