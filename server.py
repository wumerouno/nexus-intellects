import os
import sqlite3
import json
import mimetypes
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

# Force correct MIME types for CSS/JS files served on Windows hosts
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/javascript', '.js')

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app, supports_credentials=True)

DB_PATH = 'marketplace.db'
IS_PRODUCTION = os.environ.get('NEXUS_ENV') == 'production'
REGISTRATION_OPEN = os.environ.get('NEXUS_MARKETPLACE_REGISTRATION', 'closed').lower() in {'1', 'true', 'yes', 'open', 'enabled'}
SEED_DEMO_DATA = os.environ.get('NEXUS_SEED_DEMO_DATA', 'false').lower() in {'1', 'true', 'yes', 'open', 'enabled'}
ALLOW_USER_HEADER = os.environ.get('NEXUS_ALLOW_USER_HEADER', 'false').lower() in {'1', 'true', 'yes', 'enabled'}
LEADS_DIR = os.environ.get('NEXUS_LEADS_DIR', 'data')
LEADS_PATH = os.path.join(LEADS_DIR, 'leads.jsonl')

secret_key = os.environ.get('SECRET_KEY')
if IS_PRODUCTION and not secret_key:
    raise RuntimeError("SECRET_KEY must be set when NEXUS_ENV=production")
app.secret_key = secret_key or 'nexus_intellects_dev_key'

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if 'disputes' table exists, if not we will drop and recreate all to apply the new schema cleanly
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='disputes'")
    disputes_exists = cursor.fetchone()
    
    if not disputes_exists:
        print("Re-initializing database schema for Escrow Bank Transfer & Dispute Resolution...")
        cursor.execute("DROP TABLE IF EXISTS freelancers")
        cursor.execute("DROP TABLE IF EXISTS jobs")
        cursor.execute("DROP TABLE IF EXISTS proposals")
        cursor.execute("DROP TABLE IF EXISTS contracts")
        cursor.execute("DROP TABLE IF EXISTS messages")
        cursor.execute("DROP TABLE IF EXISTS clients")
        cursor.execute("DROP TABLE IF EXISTS users")
        cursor.execute("DROP TABLE IF EXISTS milestones")
        cursor.execute("DROP TABLE IF EXISTS notifications")
        cursor.execute("DROP TABLE IF EXISTS disputes")
        conn.commit()
    
    # Create tables
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        company TEXT,
        bio TEXT,
        avatar_url TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS freelancers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        rate REAL NOT NULL,
        bio TEXT NOT NULL,
        skills TEXT NOT NULL,
        rating REAL NOT NULL,
        completed_jobs INTEGER DEFAULT 0,
        avatar_url TEXT,
        portfolio_url TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        budget REAL NOT NULL,
        description TEXT NOT NULL,
        deadline TEXT NOT NULL,
        skills TEXT NOT NULL,
        client_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL,
        hired_freelancer_id INTEGER,
        FOREIGN KEY (client_id) REFERENCES clients (id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        freelancer_id INTEGER NOT NULL,
        freelancer_name TEXT NOT NULL,
        freelancer_title TEXT NOT NULL,
        bid_amount REAL NOT NULL,
        delivery_time TEXT NOT NULL,
        cover_letter TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES jobs (id),
        FOREIGN KEY (freelancer_id) REFERENCES freelancers (id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS contracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        freelancer_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL,
        client_name TEXT NOT NULL,
        freelancer_name TEXT NOT NULL,
        budget REAL NOT NULL,
        deadline TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        payment_ref TEXT,
        FOREIGN KEY (job_id) REFERENCES jobs (id),
        FOREIGN KEY (freelancer_id) REFERENCES freelancers (id),
        FOREIGN KEY (client_id) REFERENCES clients (id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_id INTEGER NOT NULL,
        sender TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        is_work_submission INTEGER DEFAULT 0,
        submission_file_url TEXT,
        FOREIGN KEY (contract_id) REFERENCES contracts (id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'funded',
        created_at TEXT NOT NULL,
        FOREIGN KEY (contract_id) REFERENCES contracts (id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS disputes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_id INTEGER UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        reason TEXT NOT NULL,
        client_response TEXT,
        resolution_type TEXT,
        escrow_resolution TEXT,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        FOREIGN KEY (contract_id) REFERENCES contracts (id)
    )
    ''')
    
    # Check if we need to seed the data
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        if IS_PRODUCTION:
            print("Production environment detected. Mock marketplace data will not be seeded.")
            admin_email = os.environ.get('NEXUS_ADMIN_EMAIL')
            admin_pass = os.environ.get('NEXUS_ADMIN_PASSWORD')
            if not admin_email or not admin_pass:
                print("No NEXUS_ADMIN_EMAIL/NEXUS_ADMIN_PASSWORD provided. Skipping mediator account seed.")
                conn.commit()
                conn.close()
                return
            p_hash_admin = generate_password_hash(admin_pass)
            created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute('''
                INSERT INTO users (id, email, password_hash, role, created_at)
                VALUES (1, ?, ?, 'escrow', ?)
            ''', (admin_email, p_hash_admin, created_at))
            conn.commit()
            conn.close()
            return # Skip seeding mock data
            
        if not SEED_DEMO_DATA:
            print("Demo marketplace data seed is disabled. Set NEXUS_SEED_DEMO_DATA=true for local fixture data.")
            conn.commit()
            conn.close()
            return

        demo_password = os.environ.get('NEXUS_DEMO_PASSWORD')
        if not demo_password:
            print("NEXUS_DEMO_PASSWORD is required when NEXUS_SEED_DEMO_DATA=true. Skipping demo seed.")
            conn.commit()
            conn.close()
            return

        print("Seeding database with local demo data...")
        
        p_hash = generate_password_hash(demo_password)
        created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # 1. Seed Users (5 freelancers, 5 clients, 1 superadmin)
        users_data = [
            (1, "elizabeth@example.com", p_hash, "freelancer", created_at),
            (2, "michael@example.com", p_hash, "freelancer", created_at),
            (3, "amina@example.com", p_hash, "freelancer", created_at),
            (4, "david@example.com", p_hash, "freelancer", created_at),
            (5, "sarah@example.com", p_hash, "freelancer", created_at),
            (6, "ademola@example.com", p_hash, "client", created_at),
            (7, "victoria@example.com", p_hash, "client", created_at),
            (8, "kola@example.com", p_hash, "client", created_at),
            (9, "tunde@example.com", p_hash, "client", created_at),
            (10, "apex@example.com", p_hash, "client", created_at),
            (11, "demo-mediator@nexus.local", p_hash, "escrow", created_at)
        ]
        cursor.executemany('''
            INSERT INTO users (id, email, password_hash, role, created_at)
            VALUES (?, ?, ?, ?, ?)
        ''', users_data)
        
        # 2. Seed Freelancers
        freelancers_data = [
            (1, 1, "Dr. Elizabeth Johnson", "Academic Research Specialist", 45.00, 
             "Vetted academic writing consultant with 8+ years helping PhD candidates structure their dissertations and publish in Q1 journals.", 
             "Academic Writing, Research Methods, Data Analysis", 4.9, 24, "EJ", "https://github.com"),
            (2, 2, "Michael Chen", "Career Strategy & Brand Designer", 35.00, 
             "Vetted CV designer and career branding consultant. Helped 300+ professionals transition into tech roles globally.", 
             "CV Design, Resume Writing, Personal Branding, LinkedIn Optimization", 4.8, 42, "MC", "https://linkedin.com"),
            (3, 3, "Amina Yusuf", "Brand Architect & Pitch Consultant", 50.00, 
             "Vetted startup consultant specialized in brand systems and investor pitch deck designs.", 
             "Brand Identity, Pitch Decks, Logo Design, Business Plans", 5.0, 18, "AY", "https://dribbble.com"),
            (4, 4, "David Olatunji", "Visa Documentation Specialist", 40.00, 
             "Expert immigration documentation consultant helping clients with Global Talent, study, and work visa petitions.", 
             "Visa Support, Letter Coordination, Statement of Purpose", 4.7, 31, "DO", "https://nexusintellects.com"),
            (5, 5, "Sarah Miller", "Data Analyst & Python Instructor", 42.00, 
             "Python developer and data analysis mentor for corporate cohorts. Specializes in building automated dashboards.", 
             "Python, SQL, Dashboards, Data Analytics", 4.9, 15, "SM", "https://github.com")
        ]
        cursor.executemany('''
            INSERT INTO freelancers (id, user_id, name, title, rate, bio, skills, rating, completed_jobs, avatar_url, portfolio_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', freelancers_data)
        
        # 3. Seed Clients
        clients_data = [
            (1, 6, "Prof. Ademola", "Academic Research Lab", "Academic director leading national research initiatives.", "PA"),
            (2, 7, "Victoria Davies", "HR Global Ltd", "Talent Acquisition Lead and HR transformation executive.", "VD"),
            (3, 8, "Kola Ventures", "Kola Ventures", "Early stage tech-focused venture capital syndicate.", "KV"),
            (4, 9, "Dr. Tunde", "Immigration Partners", "Global mobility researcher and immigration documentation advisor.", "DT"),
            (5, 10, "Apex Retail", "Apex Retail Group", "Fast-growing multi-channel consumer goods retail brand.", "AR")
        ]
        cursor.executemany('''
            INSERT INTO clients (id, user_id, name, company, bio, avatar_url)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', clients_data)
        
        # 4. Seed Jobs
        jobs_data = [
            (1, 1, "Academic Dissertation Editing & Formatting", "Academic Support", 150000.00, 
             "Need professional copy-editing, proofreading, and formatting check for a 120-page PhD thesis in international relations. Must follow Harvard referencing style. Vetted academics only.", 
             "Academic Writing, Research Methods", "2026-07-15", "Prof. Ademola", "open", "2026-06-01 09:00:00", None),
            (2, 2, "Executive CV & LinkedIn Makeover", "Career Development", 45000.00, 
             "Transitioning from HR Manager to Director of People Operations. Need a complete CV redesign, cover letter template, and LinkedIn profile optimization aligned with tech standards.", 
             "CV Design, Personal Branding, LinkedIn Optimization", "2026-06-25", "Victoria Davies", "contracted", "2026-06-02 10:00:00", 2),
            (3, 3, "Brand Identity & Pitch Deck for EdTech Startup", "Business Services", 250000.00, 
             "We are an early-stage education platform looking for a modern brand identity system (logo, typography, presentation template) and a 12-slide investor pitch deck for seed funding.", 
             "Brand Identity, Pitch Decks, Logo Design", "2026-08-01", "Kola Ventures", "open", "2026-06-03 14:00:00", None),
            (4, 4, "Visa Documentation Petition Letter Review", "Visa Documentation", 80000.00, 
             "Need a vetted visa petition consultant to review my letters of recommendation and draft the final petition letter for my UK Global Talent Visa application in research.", 
             "Visa Support, Statement of Purpose", "2026-07-05", "Dr. Tunde", "open", "2026-06-03 16:30:00", None),
            (5, 5, "Automated Sales Dashboard Setup in Excel", "Skill Development", 60000.00, 
             "Need an automated sales reporting spreadsheet with custom pivot charts, KPIs, and clean data processing macro for a retail company.", 
             "Dashboards, Data Analytics", "2026-06-30", "Apex Retail", "completed", "2026-06-01 08:30:00", 5)
        ]
        cursor.executemany('''
            INSERT INTO jobs (id, client_id, title, category, budget, description, deadline, skills, client_name, status, created_at, hired_freelancer_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', jobs_data)
        
        # 5. Seed Proposals
        proposals_data = [
            (1, 2, 2, "Michael Chen", "Career Strategy & Brand Designer", 45000.00, "5 Days", 
             "I'd love to help you rewrite and optimize your executive CV and LinkedIn profile. I've worked with numerous HR leaders transitioning to tech and know exactly what recruiters are looking for.", 
             "hired", "2026-06-02 14:00:00"),
            (2, 2, 1, "Dr. Elizabeth Johnson", "Academic Research Specialist", 50000.00, "7 Days", 
             "Although my primary expertise is academic, I have extensive experience in professional proofreading and resume structural formatting.", 
             "declined", "2026-06-02 15:30:00"),
            (3, 5, 5, "Sarah Miller", "Data Analyst & Python Instructor", 60000.00, "4 Days", 
             "I have set up dozens of spreadsheet dashboards with macros and Python integrations. I can deliver a clean, interactive sales board in 4 days.", 
             "hired", "2026-06-01 12:00:00")
        ]
        cursor.executemany('''
            INSERT INTO proposals (id, job_id, freelancer_id, freelancer_name, freelancer_title, bid_amount, delivery_time, cover_letter, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', proposals_data)
        
        # 6. Seed Contracts
        contracts_data = [
            (1, 2, 2, 2, "Victoria Davies", "Michael Chen", 45000.00, "2026-06-25", "active", "2026-06-02 18:00:00"),
            (2, 5, 5, 5, "Apex Retail", "Sarah Miller", 60000.00, "2026-06-30", "completed", "2026-06-01 16:00:00")
        ]
        cursor.executemany('''
            INSERT INTO contracts (id, job_id, freelancer_id, client_id, client_name, freelancer_name, budget, deadline, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', contracts_data)
        
        # 7. Seed Messages
        messages_data = [
            (1, "freelancer", "Hi Victoria! Thanks for hiring me. I've looked at your current CV draft. Could you please send me your target job descriptions so I can tailor the keywords?", "2026-06-03 10:00:00", 0, None),
            (1, "client", "Hi Michael, excited to work together! Here are the target roles. I want to highlight my leadership in scaling remote teams.", "2026-06-03 11:15:00", 0, None),
            (2, "freelancer", "Hi Apex team, starting on the dashboard macro today.", "2026-06-01 16:30:00", 0, None),
            (2, "freelancer", "The dashboard is complete and fully automated. I have uploaded it and linked it here. Let me know if you need any adjustments!", "2026-06-03 15:30:00", 1, "https://nexus-intellects.com/work/apex-dashboard-v1.xlsx"),
            (2, "client", "Amazing work, Sarah! The macros run perfectly and the KPI charts are clean. Releasing payment now.", "2026-06-03 17:00:00", 0, None)
        ]
        cursor.executemany('''
            INSERT INTO messages (contract_id, sender, text, timestamp, is_work_submission, submission_file_url)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', messages_data)
        
        # 8. Seed Milestones
        milestones_data = [
            (1, 1, "Initial Milestone - Executive CV Revision", 20000.00, "funded", "2026-06-02 18:05:00"),
            (2, 1, "LinkedIn Makeover & Strategy", 25000.00, "funded", "2026-06-02 18:05:00"),
            (3, 2, "Dashboard Macro & Automations", 60000.00, "released", "2026-06-01 16:05:00")
        ]
        cursor.executemany('''
            INSERT INTO milestones (id, contract_id, title, amount, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', milestones_data)
        
        # 9. Seed Notifications
        notifications_data = [
            (1, 1, "Welcome to Nexus!", "Welcome to the Nexus Expert Network. Start building your profile or browse approved projects.", "welcome", 0, created_at),
            (2, 7, "New Proposal Received", "Michael Chen submitted a proposal for your job 'Executive CV & LinkedIn Makeover'.", "bid_received", 1, "2026-06-02 14:05:00"),
            (3, 2, "Contract Awarded!", "Congratulations! Client Victoria Davies has hired you for the job 'Executive CV & LinkedIn Makeover'.", "contract_hired", 0, "2026-06-02 18:00:00"),
            (4, 5, "Contract Completed!", "Client approved and released escrow funds for your contract.", "payment_released", 0, "2026-06-03 17:05:00")
        ]
        cursor.executemany('''
            INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', notifications_data)
        
        conn.commit()
    
    # Ensure the mediator account exists only when explicit credentials are provided.
    admin_email = os.environ.get('NEXUS_ADMIN_EMAIL')
    admin_pass = os.environ.get('NEXUS_ADMIN_PASSWORD')
    if admin_email and admin_pass:
        cursor.execute("SELECT COUNT(*) FROM users WHERE email = ?", (admin_email,))
        if cursor.fetchone()[0] == 0:
            print("Seeding configured mediator account...")
            p_hash_admin = generate_password_hash(admin_pass)
            created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("SELECT MAX(id) FROM users")
            max_id = cursor.fetchone()[0] or 10
            next_id = max(max_id + 1, 11)
            cursor.execute('''
                INSERT INTO users (id, email, password_hash, role, created_at)
                VALUES (?, ?, ?, 'escrow', ?)
            ''', (next_id, admin_email, p_hash_admin, created_at))
            conn.commit()
        
    conn.close()

# Initialize database at startup/import time
init_db()

# ----------------- API ROUTES -----------------

@app.route('/api/leads', methods=['POST'])
def create_lead():
    data = request.get_json(silent=True) or {}
    required = ['name', 'email', 'message']
    missing = [field for field in required if not str(data.get(field, '')).strip()]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    def clean(field, limit=2000):
        return str(data.get(field, '')).strip()[:limit]

    lead = {
        "id": datetime.utcnow().strftime("%Y%m%d%H%M%S%f"),
        "name": clean('name', 200),
        "email": clean('email', 320),
        "phone": clean('phone', 80),
        "service": clean('service', 120),
        "message": clean('message', 4000),
        "source": clean('source', 300),
        "page_url": clean('page_url', 500),
        "created_at": clean('created_at', 80) or datetime.utcnow().isoformat() + "Z",
        "saved_at": datetime.utcnow().isoformat() + "Z",
        "user_agent": request.headers.get('User-Agent', '')[:500],
        "remote_addr": request.headers.get('X-Forwarded-For', request.remote_addr or '')[:120]
    }

    os.makedirs(LEADS_DIR, exist_ok=True)
    with open(LEADS_PATH, 'a', encoding='utf-8') as handle:
        handle.write(json.dumps(lead, ensure_ascii=False) + '\n')

    return jsonify({"success": True, "storage": "server", "lead_id": lead["id"]}), 201

# --- Authentication APIs ---

def get_user_id():
    user_id = session.get('user_id')
    if not user_id and ALLOW_USER_HEADER:
        val = request.headers.get('X-User-Id')
        if val:
            try:
                return int(val)
            except ValueError:
                pass
    return user_id

@app.route('/api/auth/me', methods=['GET'])
def get_me():
    user_id = get_user_id()
    if not user_id:
        return jsonify({"logged_in": False}), 200
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    
    if not user:
        session.pop('user_id', None)
        conn.close()
        return jsonify({"logged_in": False}), 200
        
    role = user['role']
    name = user['email'].split('@')[0].capitalize()
    profile_id = None
    
    if role == 'freelancer':
        cursor.execute("SELECT id, name FROM freelancers WHERE user_id = ?", (user_id,))
        freelancer = cursor.fetchone()
        if freelancer:
            name = freelancer['name']
            profile_id = freelancer['id']
    elif role == 'client':
        cursor.execute("SELECT id, name FROM clients WHERE user_id = ?", (user_id,))
        client = cursor.fetchone()
        if client:
            name = client['name']
            profile_id = client['id']
    else:
        name = "Escrow Mediator"
        profile_id = None
            
    conn.close()
    return jsonify({
        "logged_in": True,
        "id": user_id,
        "email": user['email'],
        "role": role,
        "name": name,
        "profile_id": profile_id
    })

@app.route('/api/auth/register', methods=['POST'])
def register():
    if not REGISTRATION_OPEN:
        return jsonify({"error": "Public marketplace registration is currently closed. Please request private beta access."}), 403

    data = request.json
    if not data or not data.get('email') or not data.get('password') or not data.get('role'):
        return jsonify({"error": "Missing email, password, or role"}), 400
        
    email = data['email'].strip().lower()
    password = data['password']
    role = data['role'].strip().lower()
    name = data.get('name', '').strip() or email.split('@')[0].capitalize()
    
    if role not in ['freelancer', 'client']:
        return jsonify({"error": "Invalid role. Must be 'freelancer' or 'client'."}), 400
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"error": "Email is already registered"}), 400
        
    password_hash = generate_password_hash(password)
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        cursor.execute('''
            INSERT INTO users (email, password_hash, role, created_at)
            VALUES (?, ?, ?, ?)
        ''', (email, password_hash, role, created_at))
        user_id = cursor.lastrowid
        
        profile_id = None
        if role == 'freelancer':
            cursor.execute('''
                INSERT INTO freelancers (user_id, name, title, rate, bio, skills, rating, completed_jobs, avatar_url, portfolio_url)
                VALUES (?, ?, 'New Freelancer', 30.00, 'I am a skilled freelance professional eager to help you succeed.', 'Freelancer', 5.0, 0, 'FL', '')
            ''', (user_id, name))
            profile_id = cursor.lastrowid
        else:
            cursor.execute('''
                INSERT INTO clients (user_id, name, company, bio, avatar_url)
                VALUES (?, ?, 'Personal Account', 'I am looking to hire top talent.', 'CL')
            ''', (user_id, name))
            profile_id = cursor.lastrowid
            
        cursor.execute('''
            INSERT INTO notifications (user_id, title, message, type, created_at)
            VALUES (?, 'Welcome to Nexus!', 'Welcome to the Nexus Expert Network. Start building your profile or browse approved projects.', 'welcome', ?)
        ''', (user_id, created_at))
        
        conn.commit()
        
        session['user_id'] = user_id
        
        user_data = {
            "logged_in": True,
            "id": user_id,
            "email": email,
            "role": role,
            "name": name,
            "profile_id": profile_id,
            "created_at": created_at
        }
        conn.close()
        return jsonify(user_data), 201
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": f"Database error: {str(e)}"}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({"error": "Missing email or password"}), 400
        
    email = data['email'].strip().lower()
    password = data['password']
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    
    if not user or not check_password_hash(user['password_hash'], password):
        conn.close()
        return jsonify({"error": "Invalid email or password"}), 401
        
    user_id = user['id']
    role = user['role']
    
    name = email.split('@')[0].capitalize()
    profile_id = None
    if role == 'freelancer':
        cursor.execute("SELECT id, name FROM freelancers WHERE user_id = ?", (user_id,))
        freelancer = cursor.fetchone()
        if freelancer:
            name = freelancer['name']
            profile_id = freelancer['id']
    elif role == 'client':
        cursor.execute("SELECT id, name FROM clients WHERE user_id = ?", (user_id,))
        client = cursor.fetchone()
        if client:
            name = client['name']
            profile_id = client['id']
    else:
        name = "Escrow Mediator"
        profile_id = None
            
    session['user_id'] = user_id
    conn.close()
    
    return jsonify({
        "logged_in": True,
        "id": user_id,
        "email": email,
        "role": role,
        "name": name,
        "profile_id": profile_id,
        "created_at": user['created_at']
    })

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({"success": True})

# --- Profile APIs ---

@app.route('/api/freelancers', methods=['GET'])
def get_freelancers():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM freelancers ORDER BY rating DESC")
    freelancers = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(freelancers)

@app.route('/api/freelancers/profile', methods=['GET'])
def get_my_profile():
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM freelancers WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return jsonify(dict(row))
    return jsonify({"error": "Profile not found"}), 404

@app.route('/api/freelancers/profile', methods=['PUT'])
def update_my_profile():
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
        
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM freelancers WHERE user_id = ?", (user_id,))
    f_row = cursor.fetchone()
    if not f_row:
        conn.close()
        return jsonify({"error": "Freelancer profile not found"}), 404
        
    cursor.execute('''
        UPDATE freelancers
        SET name = ?, title = ?, rate = ?, bio = ?, skills = ?, portfolio_url = ?
        WHERE user_id = ?
    ''', (
        data.get('name', ''),
        data.get('title', ''),
        float(data.get('rate', 30.00)),
        data.get('bio', ''),
        data.get('skills', ''),
        data.get('portfolio_url', ''),
        user_id
    ))
    conn.commit()
    
    cursor.execute("SELECT * FROM freelancers WHERE user_id = ?", (user_id,))
    profile = dict(cursor.fetchone())
    conn.close()
    return jsonify(profile)

@app.route('/api/clients/profile', methods=['GET'])
def get_client_profile():
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM clients WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return jsonify(dict(row))
    return jsonify({"error": "Client profile not found"}), 404

@app.route('/api/clients/profile', methods=['PUT'])
def update_client_profile():
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE clients
        SET name = ?, company = ?, bio = ?
        WHERE user_id = ?
    ''', (
        data.get('name', ''),
        data.get('company', ''),
        data.get('bio', ''),
        user_id
    ))
    conn.commit()
    cursor.execute("SELECT * FROM clients WHERE user_id = ?", (user_id,))
    profile = dict(cursor.fetchone())
    conn.close()
    return jsonify(profile)

# --- Jobs APIs ---

@app.route('/api/jobs', methods=['GET'])
def get_jobs():
    conn = get_db()
    cursor = conn.cursor()
    
    category = request.args.get('category')
    q = request.args.get('q')
    
    query = "SELECT * FROM jobs"
    params = []
    conditions = []
    
    if category:
        conditions.append("category = ?")
        params.append(category)
    if q:
        conditions.append("(title LIKE ? OR description LIKE ? OR skills LIKE ?)")
        params.append(f"%{q}%")
        params.append(f"%{q}%")
        params.append(f"%{q}%")
        
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    
    query += " ORDER BY id DESC"
    
    cursor.execute(query, params)
    jobs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(jobs)

@app.route('/api/jobs/<int:job_id>', methods=['GET'])
def get_job(job_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return jsonify(dict(row))
    return jsonify({"error": "Job not found"}), 404

@app.route('/api/jobs', methods=['POST'])
def post_job():
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.json
    if not data or not data.get('title') or not data.get('category') or not data.get('budget'):
        return jsonify({"error": "Missing required fields"}), 400
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM clients WHERE user_id = ?", (user_id,))
    client = cursor.fetchone()
    if not client:
        conn.close()
        return jsonify({"error": "Only clients can post jobs"}), 403
        
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute('''
        INSERT INTO jobs (client_id, title, category, budget, description, deadline, skills, client_name, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
    ''', (
        client['id'],
        data['title'],
        data['category'],
        float(data['budget']),
        data.get('description', ''),
        data.get('deadline', ''),
        data.get('skills', ''),
        client['name'],
        created_at
    ))
    job_id = cursor.lastrowid
    conn.commit()
    
    cursor.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
    new_job = dict(cursor.fetchone())
    conn.close()
    return jsonify(new_job), 201

# --- Proposals APIs ---

@app.route('/api/proposals', methods=['GET'])
def get_proposals():
    user_id = get_user_id()
    if not user_id:
        return jsonify([]), 401
    
    conn = get_db()
    cursor = conn.cursor()
    
    job_id = request.args.get('job_id')
    freelancer_id = request.args.get('freelancer_id')
    
    query = "SELECT * FROM proposals"
    params = []
    conditions = []
    
    if job_id:
        conditions.append("job_id = ?")
        params.append(job_id)
    if freelancer_id:
        conditions.append("freelancer_id = ?")
        params.append(freelancer_id)
        
    if not job_id and not freelancer_id:
        cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
        user_row = cursor.fetchone()
        if user_row:
            if user_row['role'] == 'freelancer':
                cursor.execute("SELECT id FROM freelancers WHERE user_id = ?", (user_id,))
                freelancer = cursor.fetchone()
                if freelancer:
                    conditions.append("freelancer_id = ?")
                    params.append(freelancer['id'])
            else:
                cursor.execute("SELECT id FROM clients WHERE user_id = ?", (user_id,))
                client = cursor.fetchone()
                if client:
                    cursor.execute("SELECT id FROM jobs WHERE client_id = ?", (client['id'],))
                    job_ids = [row['id'] for row in cursor.fetchall()]
                    if job_ids:
                        conditions.append(f"job_id IN ({','.join(['?']*len(job_ids))})")
                        params.extend(job_ids)
                    else:
                        conn.close()
                        return jsonify([])
                        
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
        
    query += " ORDER BY id DESC"
    cursor.execute(query, params)
    proposals = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(proposals)

@app.route('/api/proposals', methods=['POST'])
def submit_proposal():
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.json
    if not data or not data.get('job_id') or not data.get('bid_amount') or not data.get('cover_letter'):
        return jsonify({"error": "Missing required fields"}), 400
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM freelancers WHERE user_id = ?", (user_id,))
    freelancer = cursor.fetchone()
    if not freelancer:
        conn.close()
        return jsonify({"error": "Only freelancers can submit proposals"}), 403
        
    cursor.execute("SELECT id FROM proposals WHERE job_id = ? AND freelancer_id = ?", (int(data['job_id']), freelancer['id']))
    if cursor.fetchone():
        conn.close()
        return jsonify({"error": "You have already submitted a proposal for this job"}), 400
        
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute('''
        INSERT INTO proposals (job_id, freelancer_id, freelancer_name, freelancer_title, bid_amount, delivery_time, cover_letter, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        int(data['job_id']),
        freelancer['id'],
        freelancer['name'],
        freelancer['title'],
        float(data['bid_amount']),
        data.get('delivery_time', '7 Days'),
        data['cover_letter'],
        created_at
    ))
    proposal_id = cursor.lastrowid
    
    cursor.execute("SELECT client_id, title FROM jobs WHERE id = ?", (int(data['job_id']),))
    job_row = cursor.fetchone()
    if job_row:
        cursor.execute("SELECT user_id FROM clients WHERE id = ?", (job_row['client_id'],))
        client_user = cursor.fetchone()
        if client_user:
            notif_title = "New Proposal Received"
            notif_msg = f"{freelancer['name']} submitted a proposal for '{job_row['title']}'."
            cursor.execute('''
                INSERT INTO notifications (user_id, title, message, type, created_at)
                VALUES (?, ?, ?, 'bid_received', ?)
            ''', (client_user['user_id'], notif_title, notif_msg, created_at))
            
    conn.commit()
    
    cursor.execute("SELECT * FROM proposals WHERE id = ?", (proposal_id,))
    new_proposal = dict(cursor.fetchone())
    conn.close()
    return jsonify(new_proposal), 201

@app.route('/api/proposals/<int:prop_id>/hire', methods=['POST'])
def hire_proposal(prop_id):
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM clients WHERE user_id = ?", (user_id,))
    client = cursor.fetchone()
    if not client:
        conn.close()
        return jsonify({"error": "Only clients can hire freelancers"}), 403
        
    cursor.execute("SELECT * FROM proposals WHERE id = ?", (prop_id,))
    proposal = cursor.fetchone()
    if not proposal:
        conn.close()
        return jsonify({"error": "Proposal not found"}), 404
        
    cursor.execute("SELECT * FROM jobs WHERE id = ?", (proposal['job_id'],))
    job = cursor.fetchone()
    if not job:
        conn.close()
        return jsonify({"error": "Job not found"}), 404
        
    if job['client_id'] != client['id']:
        conn.close()
        return jsonify({"error": "Unauthorized: You do not own this job listing"}), 403
        
    # Read payment reference
    req_data = request.json or {}
    payment_ref = req_data.get('payment_ref', 'ZenithTransfer-Default-998')
        
    cursor.execute("UPDATE proposals SET status = 'hired' WHERE id = ?", (prop_id,))
    cursor.execute("UPDATE proposals SET status = 'declined' WHERE job_id = ? AND id != ?", (proposal['job_id'], prop_id))
    cursor.execute("UPDATE jobs SET status = 'contracted', hired_freelancer_id = ? WHERE id = ?", (proposal['freelancer_id'], proposal['job_id']))
    
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute('''
        INSERT INTO contracts (job_id, freelancer_id, client_id, client_name, freelancer_name, budget, deadline, status, created_at, payment_ref)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    ''', (
        proposal['job_id'],
        proposal['freelancer_id'],
        client['id'],
        job['client_name'],
        proposal['freelancer_name'],
        proposal['bid_amount'],
        job['deadline'],
        created_at,
        payment_ref
    ))
    contract_id = cursor.lastrowid
    
    cursor.execute('''
        INSERT INTO milestones (contract_id, title, amount, status, created_at)
        VALUES (?, 'Project Milestone (Full Budget)', ?, 'funded', ?)
    ''', (contract_id, proposal['bid_amount'], created_at))
    
    payment_info_text = f"🔐 Escrow Funding Secured: Bank Transfer reference '{payment_ref}' has been received and verified by Nexus Escrow. Budget ₦{proposal['bid_amount']:.2f} is locked in Nexus Intellect Limited Escrow Account."
    cursor.execute('''
        INSERT INTO messages (contract_id, sender, text, timestamp)
        VALUES (?, 'client', ?, ?)
    ''', (contract_id, payment_info_text, created_at))
    
    welcome_text = f"Hi {job['client_name']}! Thank you for hiring me for this project. I'm ready to get started. Please share any further instructions or source files here."
    cursor.execute('''
        INSERT INTO messages (contract_id, sender, text, timestamp)
        VALUES (?, 'freelancer', ?, ?)
    ''', (contract_id, welcome_text, created_at))
    
    cursor.execute("SELECT user_id FROM freelancers WHERE id = ?", (proposal['freelancer_id'],))
    freelancer_user = cursor.fetchone()
    if freelancer_user:
        notif_title = "Contract Awarded!"
        notif_msg = f"Congratulations! Client {client['name']} has hired you for '{job['title']}'."
        cursor.execute('''
            INSERT INTO notifications (user_id, title, message, type, created_at)
            VALUES (?, ?, ?, 'contract_hired', ?)
        ''', (freelancer_user['user_id'], notif_title, notif_msg, created_at))
        
    conn.commit()
    
    cursor.execute("SELECT * FROM contracts WHERE id = ?", (contract_id,))
    new_contract = dict(cursor.fetchone())
    conn.close()
    return jsonify(new_contract)

# --- Contracts & Chat APIs ---

@app.route('/api/contracts', methods=['GET'])
def get_contracts():
    user_id = get_user_id()
    if not user_id:
        return jsonify([]), 401
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
    user_row = cursor.fetchone()
    if not user_row:
        conn.close()
        return jsonify([])
        
    role = user_row['role']
    if role == 'freelancer':
        cursor.execute("SELECT id FROM freelancers WHERE user_id = ?", (user_id,))
        freelancer = cursor.fetchone()
        if not freelancer:
            conn.close()
            return jsonify([])
        cursor.execute("SELECT * FROM contracts WHERE freelancer_id = ? ORDER BY id DESC", (freelancer['id'],))
    else:
        cursor.execute("SELECT id FROM clients WHERE user_id = ?", (user_id,))
        client = cursor.fetchone()
        if not client:
            conn.close()
            return jsonify([])
        cursor.execute("SELECT * FROM contracts WHERE client_id = ? ORDER BY id DESC", (client['id'],))
        
    contracts = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(contracts)

@app.route('/api/contracts/<int:contract_id>/complete', methods=['POST'])
def complete_contract(contract_id):
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM clients WHERE user_id = ?", (user_id,))
    client = cursor.fetchone()
    if not client:
        conn.close()
        return jsonify({"error": "Only clients can complete contracts"}), 403
        
    cursor.execute("SELECT * FROM contracts WHERE id = ?", (contract_id,))
    contract = cursor.fetchone()
    if not contract:
        conn.close()
        return jsonify({"error": "Contract not found"}), 404
        
    if contract['client_id'] != client['id']:
        conn.close()
        return jsonify({"error": "Unauthorized: You do not own this contract"}), 403
        
    cursor.execute("UPDATE contracts SET status = 'completed' WHERE id = ?", (contract_id,))
    cursor.execute("UPDATE jobs SET status = 'completed' WHERE id = ?", (contract['job_id'],))
    cursor.execute("UPDATE freelancers SET completed_jobs = completed_jobs + 1 WHERE id = ?", (contract['freelancer_id'],))
    cursor.execute("UPDATE milestones SET status = 'released' WHERE contract_id = ?", (contract_id,))
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    completion_text = "Project completed! Client has approved the final work submission, released all escrow funds, and closed this contract."
    cursor.execute('''
        INSERT INTO messages (contract_id, sender, text, timestamp)
        VALUES (?, 'client', ?, ?)
    ''', (contract_id, completion_text, timestamp))
    
    cursor.execute("SELECT user_id FROM freelancers WHERE id = ?", (contract['freelancer_id'],))
    freelancer_user = cursor.fetchone()
    if freelancer_user:
        notif_title = "Contract Completed!"
        notif_msg = f"Client approved and released escrow funds for your contract."
        cursor.execute('''
            INSERT INTO notifications (user_id, title, message, type, created_at)
            VALUES (?, ?, ?, 'payment_released', ?)
        ''', (freelancer_user['user_id'], notif_title, notif_msg, timestamp))
        
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/contracts/<int:contract_id>/messages', methods=['GET'])
def get_messages(contract_id):
    user_id = get_user_id()
    if not user_id:
        return jsonify([]), 401
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM messages WHERE contract_id = ? ORDER BY id ASC", (contract_id,))
    messages = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(messages)

@app.route('/api/contracts/<int:contract_id>/messages', methods=['POST'])
def post_message(contract_id):
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.json
    if not data or not data.get('text'):
        return jsonify({"error": "Missing required fields"}), 400
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM contracts WHERE id = ?", (contract_id,))
    contract = cursor.fetchone()
    if not contract:
        conn.close()
        return jsonify({"error": "Contract not found"}), 404
        
    cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
    user_row = cursor.fetchone()
    if not user_row:
        conn.close()
        return jsonify({"error": "User profile not found"}), 404
        
    role = user_row['role']
    sender = role
    
    if role == 'freelancer':
        cursor.execute("SELECT id FROM freelancers WHERE user_id = ?", (user_id,))
        freelancer = cursor.fetchone()
        if not freelancer or contract['freelancer_id'] != freelancer['id']:
            conn.close()
            return jsonify({"error": "Unauthorized: You are not the freelancer in this contract"}), 403
    else:
        cursor.execute("SELECT id FROM clients WHERE user_id = ?", (user_id,))
        client = cursor.fetchone()
        if not client or contract['client_id'] != client['id']:
            conn.close()
            return jsonify({"error": "Unauthorized: You are not the client in this contract"}), 403
            
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    is_work = int(data.get('is_work_submission', 0))
    file_url = data.get('submission_file_url', None)
    
    cursor.execute('''
        INSERT INTO messages (contract_id, sender, text, timestamp, is_work_submission, submission_file_url)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (
        contract_id,
        sender,
        data['text'],
        timestamp,
        is_work,
        file_url
    ))
    message_id = cursor.lastrowid
    
    other_user_id = None
    if role == 'freelancer':
        cursor.execute("SELECT user_id FROM clients WHERE id = ?", (contract['client_id'],))
        row = cursor.fetchone()
        if row:
            other_user_id = row['user_id']
    else:
        cursor.execute("SELECT user_id FROM freelancers WHERE id = ?", (contract['freelancer_id'],))
        row = cursor.fetchone()
        if row:
            other_user_id = row['user_id']
            
    if other_user_id:
        notif_title = f"New Message from {contract['freelancer_name'] if role == 'freelancer' else contract['client_name']}"
        notif_msg = data['text'][:60] + "..." if len(data['text']) > 60 else data['text']
        cursor.execute('''
            INSERT INTO notifications (user_id, title, message, type, created_at)
            VALUES (?, ?, ?, 'message', ?)
        ''', (other_user_id, notif_title, notif_msg, timestamp))
        
    conn.commit()
    
    cursor.execute("SELECT * FROM messages WHERE id = ?", (message_id,))
    sent_message = dict(cursor.fetchone())
    
    if role == 'client' and not is_work:
        if contract['status'] == 'active':
            # Check if freelancer is one of the mock accounts (meaning they have user_id and email but aren't actively controlled)
            # We auto-reply from them to simulate live interaction
            auto_reply_text = f"Got it, {contract['client_name']}. I will review this immediately and keep you posted."
            cursor.execute('''
                INSERT INTO messages (contract_id, sender, text, timestamp)
                VALUES (?, 'freelancer', ?, ?)
            ''', (contract_id, auto_reply_text, timestamp))
            
            cursor.execute('''
                INSERT INTO notifications (user_id, title, message, type, created_at)
                VALUES (?, ?, ?, 'message', ?)
            ''', (user_id, f"New Message from {contract['freelancer_name']}", auto_reply_text, timestamp))
            conn.commit()
            
    conn.close()
    return jsonify(sent_message), 201

# --- Escrow Milestones APIs ---

@app.route('/api/contracts/<int:contract_id>/milestones', methods=['GET'])
def get_milestones(contract_id):
    user_id = get_user_id()
    if not user_id:
        return jsonify([]), 401
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM milestones WHERE contract_id = ? ORDER BY id ASC", (contract_id,))
    milestones = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(milestones)

@app.route('/api/contracts/<int:contract_id>/milestones/<int:milestone_id>/release', methods=['POST'])
def release_milestone(contract_id, milestone_id):
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT client_id, freelancer_id FROM contracts WHERE id = ?", (contract_id,))
    contract = cursor.fetchone()
    if not contract:
        conn.close()
        return jsonify({"error": "Contract not found"}), 404
        
    cursor.execute("SELECT id FROM clients WHERE user_id = ?", (user_id,))
    client = cursor.fetchone()
    if not client or contract['client_id'] != client['id']:
        conn.close()
        return jsonify({"error": "Unauthorized: Only the client can release milestones"}), 403
        
    cursor.execute("UPDATE milestones SET status = 'released' WHERE id = ? AND contract_id = ?", (milestone_id, contract_id))
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("SELECT title, amount FROM milestones WHERE id = ?", (milestone_id,))
    m_row = cursor.fetchone()
    if m_row:
        release_text = f"Escrow Milestone Released: '{m_row['title']}' (${m_row['amount']:.2f}) has been released."
        cursor.execute('''
            INSERT INTO messages (contract_id, sender, text, timestamp)
            VALUES (?, 'client', ?, ?)
        ''', (contract_id, release_text, timestamp))
        
        cursor.execute("SELECT user_id FROM freelancers WHERE id = ?", (contract['freelancer_id'],))
        f_user = cursor.fetchone()
        if f_user:
            cursor.execute('''
                INSERT INTO notifications (user_id, title, message, type, created_at)
                VALUES (?, 'Milestone Funds Released', ?, 'payment_released', ?)
            ''', (f_user['user_id'], f"Client released ${m_row['amount']:.2f} for '{m_row['title']}'.", timestamp))
            
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/contracts/<int:contract_id>/milestones/<int:milestone_id>/request', methods=['POST'])
def request_milestone(contract_id, milestone_id):
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT client_id, freelancer_id FROM contracts WHERE id = ?", (contract_id,))
    contract = cursor.fetchone()
    if not contract:
        conn.close()
        return jsonify({"error": "Contract not found"}), 404
        
    cursor.execute("SELECT id FROM freelancers WHERE user_id = ?", (user_id,))
    freelancer = cursor.fetchone()
    if not freelancer or contract['freelancer_id'] != freelancer['id']:
        conn.close()
        return jsonify({"error": "Unauthorized: Only the hired freelancer can request milestone release"}), 403
        
    cursor.execute("UPDATE milestones SET status = 'requested' WHERE id = ? AND contract_id = ?", (milestone_id, contract_id))
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("SELECT title, amount FROM milestones WHERE id = ?", (milestone_id,))
    m_row = cursor.fetchone()
    if m_row:
        request_text = f"Payment Request: Freelancer has requested release of Milestone '{m_row['title']}' (${m_row['amount']:.2f})."
        cursor.execute('''
            INSERT INTO messages (contract_id, sender, text, timestamp)
            VALUES (?, 'freelancer', ?, ?)
        ''', (contract_id, request_text, timestamp))
        
        cursor.execute("SELECT user_id FROM clients WHERE id = ?", (contract['client_id'],))
        c_user = cursor.fetchone()
        if c_user:
            cursor.execute('''
                INSERT INTO notifications (user_id, title, message, type, created_at)
                VALUES (?, 'Milestone Release Requested', ?, 'bid_received', ?)
            ''', (c_user['user_id'], f"Freelancer requested release of ${m_row['amount']:.2f} for '{m_row['title']}'.", timestamp))
            
    conn.commit()
    conn.close()
    return jsonify({"success": True})

# --- Notifications APIs ---

@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    user_id = get_user_id()
    if not user_id:
        return jsonify([]), 401
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50", (user_id,))
    notifications = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(notifications)

@app.route('/api/notifications/mark-read', methods=['POST'])
def mark_notifications_read():
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.json or {}
    notif_id = data.get('id')
    
    conn = get_db()
    cursor = conn.cursor()
    if notif_id:
        cursor.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id = ?", (user_id, notif_id))
    else:
        cursor.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

# --- Escrow Disputes APIs ---

@app.route('/api/disputes', methods=['GET'])
def get_all_disputes():
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
    u_row = cursor.fetchone()
    if not u_row or u_row['role'] != 'escrow':
        conn.close()
        return jsonify({"error": "Forbidden: Access restricted to Escrow Mediators"}), 403
        
    cursor.execute('''
        SELECT d.*, c.client_name, c.freelancer_name, c.budget, j.title as job_title
        FROM disputes d
        JOIN contracts c ON d.contract_id = c.id
        JOIN jobs j ON c.job_id = j.id
        ORDER BY d.id DESC
    ''')
    rows = cursor.fetchall()
    disputes = [dict(row) for row in rows]
    conn.close()
    return jsonify(disputes)

@app.route('/api/contracts/<int:contract_id>/dispute', methods=['POST'])
def file_dispute(contract_id):
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.json or {}
    reason = data.get('reason', '').strip()
    if not reason:
        return jsonify({"error": "Reason is required to file a dispute"}), 400
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM contracts WHERE id = ?", (contract_id,))
    contract = cursor.fetchone()
    if not contract:
        conn.close()
        return jsonify({"error": "Contract not found"}), 404
        
    cursor.execute("SELECT id FROM freelancers WHERE user_id = ?", (user_id,))
    freelancer = cursor.fetchone()
    if not freelancer or contract['freelancer_id'] != freelancer['id']:
        conn.close()
        return jsonify({"error": "Unauthorized: Only the hired freelancer can file a dispute"}), 403
        
    cursor.execute("SELECT id FROM disputes WHERE contract_id = ?", (contract_id,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"error": "A dispute has already been filed for this contract"}), 400
        
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        # Create dispute
        cursor.execute('''
            INSERT INTO disputes (contract_id, status, reason, created_at)
            VALUES (?, 'open', ?, ?)
        ''', (contract_id, reason, created_at))
        
        # Update contract status
        cursor.execute("UPDATE contracts SET status = 'disputed' WHERE id = ?", (contract_id,))
        cursor.execute("UPDATE jobs SET status = 'disputed' WHERE id = ?", (contract['job_id'],))
        
        # Insert audit trail message
        dispute_msg = f"⚠️ Dispute Filed: Freelancer has initiated a dispute. Reason: \"{reason}\". Escrow payment processing is suspended pending mediation."
        cursor.execute('''
            INSERT INTO messages (contract_id, sender, text, timestamp)
            VALUES (?, 'freelancer', ?, ?)
        ''', (contract_id, dispute_msg, created_at))
        
        # Notify Client
        cursor.execute("SELECT user_id FROM clients WHERE id = ?", (contract['client_id'],))
        c_user = cursor.fetchone()
        if c_user:
            cursor.execute('''
                INSERT INTO notifications (user_id, title, message, type, created_at)
                VALUES (?, 'Dispute Opened on Contract', ?, 'dispute_opened', ?)
            ''', (c_user['user_id'], f"Freelancer filed a dispute for contract '{contract['client_name']}'. Please submit a response.", created_at))
            
        conn.commit()
        conn.close()
        return jsonify({"success": True, "status": "open"}), 201
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 500

@app.route('/api/contracts/<int:contract_id>/dispute/respond', methods=['POST'])
def respond_dispute(contract_id):
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.json or {}
    response_text = data.get('response', '').strip()
    if not response_text:
        return jsonify({"error": "Response message is required"}), 400
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM contracts WHERE id = ?", (contract_id,))
    contract = cursor.fetchone()
    if not contract:
        conn.close()
        return jsonify({"error": "Contract not found"}), 404
        
    cursor.execute("SELECT id FROM clients WHERE user_id = ?", (user_id,))
    client = cursor.fetchone()
    if not client or contract['client_id'] != client['id']:
        conn.close()
        return jsonify({"error": "Unauthorized: Only the client can respond to a dispute"}), 403
        
    cursor.execute("SELECT * FROM disputes WHERE contract_id = ?", (contract_id,))
    dispute = cursor.fetchone()
    if not dispute:
        conn.close()
        return jsonify({"error": "No open dispute found for this contract"}), 404
        
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        cursor.execute('''
            UPDATE disputes
            SET status = 'responded', client_response = ?
            WHERE contract_id = ?
        ''', (response_text, contract_id))
        
        # Log response in messages
        response_msg = f"⚠️ Dispute Response Submitted: Client Victoria Davies has responded. Response: \"{response_text}\". Escrow Mediation Team notified."
        cursor.execute('''
            INSERT INTO messages (contract_id, sender, text, timestamp)
            VALUES (?, 'client', ?, ?)
        ''', (contract_id, response_msg, created_at))
        
        # Notify Freelancer
        cursor.execute("SELECT user_id FROM freelancers WHERE id = ?", (contract['freelancer_id'],))
        f_user = cursor.fetchone()
        if f_user:
            cursor.execute('''
                INSERT INTO notifications (user_id, title, message, type, created_at)
                VALUES (?, 'Dispute Response Received', ?, 'dispute_responded', ?)
            ''', (f_user['user_id'], f"Client responded to your dispute. Nexus Escrow Agent is reviewing the ticket.", created_at))
            
        conn.commit()
        conn.close()
        return jsonify({"success": True, "status": "responded"})
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 500

@app.route('/api/contracts/<int:contract_id>/dispute/resolve', methods=['POST'])
def resolve_dispute(contract_id):
    user_id = get_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
    u_row = cursor.fetchone()
    if not u_row or u_row['role'] != 'escrow':
        conn.close()
        return jsonify({"error": "Forbidden: Only Escrow Mediators can resolve disputes"}), 403
        
    data = request.json or {}
    resolution_type = data.get('resolution_type', '').strip().lower() # 'release', 'refund', 'split'
    escrow_resolution = data.get('escrow_resolution', '').strip()
    
    if resolution_type not in ['release', 'refund', 'split']:
        return jsonify({"error": "Invalid resolution type. Must be 'release', 'refund', or 'split'"}), 400
    if not escrow_resolution:
        return jsonify({"error": "Resolution statement is required"}), 400
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM contracts WHERE id = ?", (contract_id,))
    contract = cursor.fetchone()
    if not contract:
        conn.close()
        return jsonify({"error": "Contract not found"}), 404
        
    cursor.execute("SELECT * FROM disputes WHERE contract_id = ?", (contract_id,))
    dispute = cursor.fetchone()
    if not dispute:
        conn.close()
        return jsonify({"error": "Dispute not found"}), 404
        
    resolved_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        # Update dispute record
        cursor.execute('''
            UPDATE disputes
            SET status = 'resolved', resolution_type = ?, escrow_resolution = ?, resolved_at = ?
            WHERE contract_id = ?
        ''', (resolution_type, escrow_resolution, resolved_at, contract_id))
        
        # Complete contract
        cursor.execute("UPDATE contracts SET status = 'completed' WHERE id = ?", (contract_id,))
        cursor.execute("UPDATE jobs SET status = 'completed' WHERE id = ?", (contract['job_id'],))
        
        # Resolve milestones
        if resolution_type == 'release':
            cursor.execute("UPDATE milestones SET status = 'released' WHERE contract_id = ?", (contract_id,))
            cursor.execute("UPDATE freelancers SET completed_jobs = completed_jobs + 1 WHERE id = ?", (contract['freelancer_id'],))
            resolution_label = "100% Funds Released to Freelancer"
        elif resolution_type == 'refund':
            cursor.execute("UPDATE milestones SET status = 'refunded' WHERE contract_id = ?", (contract_id,))
            resolution_label = "100% Funds Refunded to Client"
        else: # split
            # Split milestones into 50% released, 50% refunded
            cursor.execute("SELECT id, amount FROM milestones WHERE contract_id = ?", (contract_id,))
            milestones = cursor.fetchall()
            for m in milestones:
                half_amount = m['amount'] / 2.0
                # Delete original milestone and create two new ones to reflect the split cleanly
                cursor.execute("DELETE FROM milestones WHERE id = ?", (m['id'],))
                cursor.execute('''
                    INSERT INTO milestones (contract_id, title, amount, status, created_at)
                    VALUES (?, 'Dispute Split (Freelancer Payout)', ?, 'released', ?)
                ''', (contract_id, half_amount, resolved_at))
                cursor.execute('''
                    INSERT INTO milestones (contract_id, title, amount, status, created_at)
                    VALUES (?, 'Dispute Split (Client Refund)', ?, 'refunded', ?)
                ''', (contract_id, half_amount, resolved_at))
            cursor.execute("UPDATE freelancers SET completed_jobs = completed_jobs + 1 WHERE id = ?", (contract['freelancer_id'],))
            resolution_label = "50/50 Split Payout & Refund"
            
        # Log final system message
        resolution_msg = f"🏁 Dispute Resolved by Escrow Mediator: [{resolution_label}]. Mediation Notes: \"{escrow_resolution}\". Escrow transaction finalized."
        cursor.execute('''
            INSERT INTO messages (contract_id, sender, text, timestamp)
            VALUES (?, 'client', ?, ?)
        ''', (contract_id, resolution_msg, resolved_at))
        
        # Notify Freelancer
        cursor.execute("SELECT user_id FROM freelancers WHERE id = ?", (contract['freelancer_id'],))
        f_user = cursor.fetchone()
        if f_user:
            cursor.execute('''
                INSERT INTO notifications (user_id, title, message, type, created_at)
                VALUES (?, 'Dispute Resolution Issued', ?, 'dispute_resolved', ?)
            ''', (f_user['user_id'], f"Dispute resolved by Escrow: {resolution_label}.", resolved_at))
            
        # Notify Client
        cursor.execute("SELECT user_id FROM clients WHERE id = ?", (contract['client_id'],))
        c_user = cursor.fetchone()
        if c_user:
            cursor.execute('''
                INSERT INTO notifications (user_id, title, message, type, created_at)
                VALUES (?, 'Dispute Resolution Issued', ?, 'dispute_resolved', ?)
            ''', (c_user['user_id'], f"Dispute resolved by Escrow: {resolution_label}.", resolved_at))
            
        conn.commit()
        conn.close()
        return jsonify({"success": True, "status": "resolved", "resolution_type": resolution_type})
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 500

# ----------------- STATIC ROUTING -----------------

@app.route('/')
def root():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_file(path):
    # Verify file exists before serving, otherwise fall back to index.html
    if os.path.exists(os.path.join('.', path)):
        return send_from_directory('.', path)
    return send_from_directory('.', 'index.html')

if __name__ == '__main__':
    print("Flask server running at http://127.0.0.1:5000/")
    app.run(host='0.0.0.0', port=5000, debug=True)
