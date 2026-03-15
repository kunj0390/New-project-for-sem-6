# ============================================================
# app.py — Flask Backend API
# Hospital Real-Time Monitoring System
# Run: python app.py
# ============================================================

from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import random
import os
import datetime
import json

# Import our AI model functions
from model import predict_next_24h, get_historical_trends, train_models

# ── App setup ────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)   # Allow cross-origin requests from the frontend

# ── Database setup ───────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), 'hospital.db')

def init_db():
    """
    Creates the SQLite database and seeds initial hospital data
    if it doesn't exist yet.
    """
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()

    # Table: current hospital resource snapshot
    c.execute('''
        CREATE TABLE IF NOT EXISTS hospital_resources (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            total_beds          INTEGER DEFAULT 200,
            available_beds      INTEGER DEFAULT 80,
            icu_total           INTEGER DEFAULT 40,
            icu_available       INTEGER DEFAULT 12,
            oxygen_stock        INTEGER DEFAULT 500,
            oxygen_threshold    INTEGER DEFAULT 100,
            ventilators_total   INTEGER DEFAULT 30,
            ventilators_available INTEGER DEFAULT 10,
            patient_admission_rate REAL DEFAULT 4.5,
            last_updated        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Table: alert log
    c.execute('''
        CREATE TABLE IF NOT EXISTS alerts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            alert_type  TEXT,
            message     TEXT,
            severity    TEXT,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Table: resource update history (for audit trail)
    c.execute('''
        CREATE TABLE IF NOT EXISTS resource_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            resource    TEXT,
            old_value   REAL,
            new_value   REAL,
            updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Seed initial data if table is empty
    c.execute('SELECT COUNT(*) FROM hospital_resources')
    if c.fetchone()[0] == 0:
        c.execute('''
            INSERT INTO hospital_resources
            (total_beds, available_beds, icu_total, icu_available,
             oxygen_stock, oxygen_threshold, ventilators_total, ventilators_available,
             patient_admission_rate)
            VALUES (200, 78, 40, 12, 480, 100, 30, 11, 4.2)
        ''')

    conn.commit()
    conn.close()
    print("[DB] Database initialized.")


def get_db_connection():
    """Returns a SQLite connection with row_factory for dict-like access."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def check_and_create_alerts(data):
    """
    Checks resource levels and inserts alerts into the DB
    if thresholds are breached.
    """
    conn = get_db_connection()
    c    = conn.cursor()
    now  = datetime.datetime.now().isoformat()

    alerts_fired = []

    # Critical: oxygen below threshold
    if data['oxygen_stock'] < data['oxygen_threshold']:
        msg = f"CRITICAL: Oxygen stock ({data['oxygen_stock']} units) below threshold ({data['oxygen_threshold']} units)!"
        c.execute('INSERT INTO alerts (alert_type, message, severity) VALUES (?,?,?)',
                  ('oxygen_critical', msg, 'critical'))
        alerts_fired.append({'type': 'oxygen_critical', 'message': msg, 'severity': 'critical'})

    # Warning: oxygen within 30% of threshold
    elif data['oxygen_stock'] < data['oxygen_threshold'] * 1.3:
        msg = f"WARNING: Oxygen stock running low — {data['oxygen_stock']} units remaining."
        c.execute('INSERT INTO alerts (alert_type, message, severity) VALUES (?,?,?)',
                  ('oxygen_warning', msg, 'warning'))
        alerts_fired.append({'type': 'oxygen_warning', 'message': msg, 'severity': 'warning'})

    # Critical: no beds available
    if data['available_beds'] == 0:
        msg = "CRITICAL: No general beds available! Divert incoming patients."
        c.execute('INSERT INTO alerts (alert_type, message, severity) VALUES (?,?,?)',
                  ('beds_full', msg, 'critical'))
        alerts_fired.append({'type': 'beds_full', 'message': msg, 'severity': 'critical'})

    # Warning: bed occupancy > 90%
    elif data['available_beds'] / data['total_beds'] < 0.1:
        msg = f"WARNING: Bed occupancy above 90% — only {data['available_beds']} beds free."
        c.execute('INSERT INTO alerts (alert_type, message, severity) VALUES (?,?,?)',
                  ('beds_critical', msg, 'warning'))
        alerts_fired.append({'type': 'beds_critical', 'message': msg, 'severity': 'warning'})

    # Warning: ICU beds low
    if data['icu_available'] <= 3:
        msg = f"WARNING: Only {data['icu_available']} ICU beds remaining!"
        c.execute('INSERT INTO alerts (alert_type, message, severity) VALUES (?,?,?)',
                  ('icu_low', msg, 'warning'))
        alerts_fired.append({'type': 'icu_low', 'message': msg, 'severity': 'warning'})

    conn.commit()
    conn.close()
    return alerts_fired


# ═══════════════════════════════════════════════════════════
# API ROUTES
# ═══════════════════════════════════════════════════════════

@app.route('/')
def index():
    # Serve the main dashboard HTML
    with open('index.html', 'r', encoding='utf-8') as f:
        return f.read()


# ── GET /getHospitalData ─────────────────────────────────────
@app.route('/getHospitalData', methods=['GET'])
def get_hospital_data():
    """
    Returns the current snapshot of all hospital resources.
    Also adds small realistic fluctuations to simulate live data.
    """
    conn = get_db_connection()
    row  = conn.execute('SELECT * FROM hospital_resources ORDER BY id DESC LIMIT 1').fetchone()
    conn.close()

    if not row:
        return jsonify({'error': 'No data found'}), 404

    data = dict(row)

    # Simulate real-time fluctuations (±1-3 units per refresh)
    data['available_beds']          = max(0, min(data['total_beds'],
                                         data['available_beds'] + random.randint(-2, 2)))
    data['icu_available']           = max(0, min(data['icu_total'],
                                         data['icu_available'] + random.randint(-1, 1)))
    data['oxygen_stock']            = max(0, data['oxygen_stock'] + random.randint(-5, 2))
    data['ventilators_available']   = max(0, min(data['ventilators_total'],
                                         data['ventilators_available'] + random.randint(-1, 1)))
    data['patient_admission_rate']  = round(max(0.5,
                                         data['patient_admission_rate'] + random.uniform(-0.3, 0.3)), 1)
    data['last_updated']            = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    # Compute derived metrics
    data['bed_occupancy_pct']    = round((1 - data['available_beds'] / data['total_beds']) * 100, 1)
    data['icu_occupancy_pct']    = round((1 - data['icu_available'] / data['icu_total']) * 100, 1)
    data['oxygen_pct']           = round((data['oxygen_stock'] / 500) * 100, 1)
    data['ventilator_occupancy'] = round((1 - data['ventilators_available'] / data['ventilators_total']) * 100, 1)

    # Check alerts
    active_alerts = check_and_create_alerts(data)
    data['active_alerts'] = active_alerts

    # Update DB with simulated values
    conn = get_db_connection()
    conn.execute('''
        UPDATE hospital_resources SET
            available_beds=?, icu_available=?, oxygen_stock=?,
            ventilators_available=?, patient_admission_rate=?, last_updated=CURRENT_TIMESTAMP
        WHERE id=?
    ''', (data['available_beds'], data['icu_available'], data['oxygen_stock'],
          data['ventilators_available'], data['patient_admission_rate'], data['id']))
    conn.commit()
    conn.close()

    return jsonify(data)


# ── POST /updateResources ────────────────────────────────────
@app.route('/updateResources', methods=['POST'])
def update_resources():
    """
    Manually update hospital resource values.
    Accepts JSON body with any subset of resource fields.
    Example: { "oxygen_stock": 450, "available_beds": 70 }
    """
    body = request.get_json()
    if not body:
        return jsonify({'error': 'No JSON body provided'}), 400

    # Whitelist of updatable fields
    allowed = ['total_beds', 'available_beds', 'icu_total', 'icu_available',
               'oxygen_stock', 'oxygen_threshold', 'ventilators_total',
               'ventilators_available', 'patient_admission_rate']

    # Build dynamic UPDATE statement from allowed keys only
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        return jsonify({'error': 'No valid fields to update'}), 400

    conn = get_db_connection()

    # Log changes for audit trail
    current = conn.execute('SELECT * FROM hospital_resources ORDER BY id DESC LIMIT 1').fetchone()
    for field, new_val in updates.items():
        old_val = current[field] if current else None
        conn.execute('INSERT INTO resource_history (resource, old_value, new_value) VALUES (?,?,?)',
                     (field, old_val, new_val))

    # Perform update
    set_clause = ', '.join([f'{k}=?' for k in updates.keys()])
    values     = list(updates.values())
    conn.execute(f'UPDATE hospital_resources SET {set_clause}, last_updated=CURRENT_TIMESTAMP WHERE id=?',
                 values + [current['id']])
    conn.commit()
    conn.close()

    return jsonify({'success': True, 'updated_fields': list(updates.keys())})


# ── GET /predictDemand ───────────────────────────────────────
@app.route('/predictDemand', methods=['GET'])
def predict_demand():
    """
    Runs the AI model and returns 24-hour demand predictions
    for beds, oxygen, and ICU capacity.
    """
    try:
        predictions = predict_next_24h()
        return jsonify({
            'success': True,
            'predictions': predictions,
            'generated_at': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ── GET /historicalTrends ────────────────────────────────────
@app.route('/historicalTrends', methods=['GET'])
def historical_trends():
    """
    Returns last 30 days of historical data for chart rendering.
    Optional query param: ?days=7 (default 30)
    """
    days = int(request.args.get('days', 30))
    try:
        data = get_historical_trends(days)
        return jsonify({'success': True, 'data': data})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ── GET /alerts ──────────────────────────────────────────────
@app.route('/alerts', methods=['GET'])
def get_alerts():
    """
    Returns the last 20 alert records from the database.
    """
    conn    = get_db_connection()
    rows    = conn.execute('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 20').fetchall()
    conn.close()
    return jsonify({'alerts': [dict(r) for r in rows]})


# ── GET /trainModel ──────────────────────────────────────────
@app.route('/trainModel', methods=['GET'])
def retrain_model():
    """
    Re-trains the AI models. Useful after new data is added.
    """
    try:
        results = train_models()
        return jsonify({'success': True, 'model_metrics': results})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ═══════════════════════════════════════════════════════════
# STARTUP
# ═══════════════════════════════════════════════════════════

# Static file routes
@app.route('/style.css')
def serve_css():
    with open('style.css', 'r', encoding='utf-8') as f:
        return f.read(), 200, {'Content-Type': 'text/css'}

@app.route('/script.js')
def serve_js():
    with open('script.js', 'r', encoding='utf-8') as f:
        return f.read(), 200, {'Content-Type': 'application/javascript'}

if __name__ == '__main__':
    init_db()            # Ensure DB and tables exist
    print("[API] Starting Hospital Monitoring API on http://localhost:5000")
    print("[API] Available endpoints:")
    print("  GET  /getHospitalData")
    print("  POST /updateResources")
    print("  GET  /predictDemand")
    print("  GET  /historicalTrends")
    print("  GET  /alerts")
    print("  GET  /trainModel")
    app.run(debug=True, host='0.0.0.0', port=5000)
