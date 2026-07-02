/* ============================================================
   NEXUS INTELLECTS — Expert Network Client Engine
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ---------- Safe Storage Wrapper ---------- */
  const storage = (() => {
    let memoryDb = {};
    return {
      getItem: (key) => {
        try {
          return localStorage.getItem(key);
        } catch (e) {
          return memoryDb[key] || null;
        }
      },
      setItem: (key, val) => {
        try {
          localStorage.setItem(key, val);
        } catch (e) {
          memoryDb[key] = val;
        }
      }
    };
  })();

  // --- Configuration ---
    const API_BASE = `${window.location.origin}/api`;
  
  // Override fetch to support credentials and X-User-Id fallback header
  const originalFetch = window.fetch;
  window.fetch = async function(resource, init = {}) {
    init = init || {};
    init.credentials = 'include';
    init.headers = init.headers || {};
    
    let userId = null;
    if (currentUser && currentUser.id) {
      userId = currentUser.id;
    } else {
      let cached = storage.getItem('m_session_user');
      if (cached) {
        try {
          let parsed = JSON.parse(cached);
          if (parsed && parsed.id) {
            userId = parsed.id;
          }
        } catch (e) {}
      }
    }
    
    if (userId) {
      if (init.headers instanceof Headers) {
        init.headers.set('X-User-Id', String(userId));
      } else if (Array.isArray(init.headers)) {
        let found = false;
        for (let pair of init.headers) {
          if (pair[0].toLowerCase() === 'x-user-id') {
            found = true;
            break;
          }
        }
        if (!found) {
          init.headers.push(['X-User-Id', String(userId)]);
        }
      } else {
        init.headers['X-User-Id'] = String(userId);
      }
    }
    return originalFetch(resource, init);
  };
  let apiMode = false;
  let currentRole = 'freelancer'; // 'freelancer' or 'client'
  let currentUser = null; // Stores authenticated user session details
  let activeChatContractId = null;
  let chatPollInterval = null;
  const publicLanding = document.getElementById('marketplace-public');
  const appShell = document.getElementById('marketplace-app-shell');
  const authOverlay = document.getElementById('auth-overlay');
  const betaStatus = document.getElementById('marketplace-gate-status');

  function showPublicLanding() {
    if (publicLanding) publicLanding.hidden = false;
    if (appShell) appShell.hidden = true;
    if (authOverlay) authOverlay.style.display = 'none';
    document.body.style.overflow = '';
    const userMenu = document.getElementById('user-menu');
    const navCta = document.getElementById('btn-get-started-nav');
    if (userMenu) userMenu.style.display = 'none';
    if (navCta) navCta.style.display = 'block';
  }

  function showAppShell() {
    if (publicLanding) publicLanding.hidden = true;
    if (appShell) appShell.hidden = false;
  }

  function openAuthOverlay() {
    if (authOverlay) {
      authOverlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  }

  function closeAuthOverlay() {
    if (authOverlay) {
      authOverlay.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  // --- Local Database Fallback (LocalStorage Seeding) ---
  const DEFAULT_PROFILE = {
    id: 1,
    name: "Dr. Elizabeth Johnson",
    title: "Academic Research Specialist",
    rate: 45.00,
    bio: "Vetted academic writing consultant with 8+ years helping PhD candidates structure their dissertations and publish in Q1 journals.",
    skills: "Academic Writing, Research Methods, Data Analysis",
    rating: 4.9,
    completed_jobs: 24,
    avatar_url: "EJ",
    portfolio_url: "https://github.com"
  };

  const MOCK_FREELANCERS = [
    DEFAULT_PROFILE,
    {
      id: 2,
      name: "Michael Chen",
      title: "Career Strategy & Brand Designer",
      rate: 35.00,
      bio: "Vetted CV designer and career branding consultant. Helped 300+ professionals transition into tech roles globally.",
      skills: "CV Design, Resume Writing, Personal Branding, LinkedIn Optimization",
      rating: 4.8,
      completed_jobs: 42,
      avatar_url: "MC",
      portfolio_url: "https://linkedin.com"
    },
    {
      id: 3,
      name: "Amina Yusuf",
      title: "Brand Architect & Pitch Consultant",
      rate: 50.00,
      bio: "Vetted startup consultant specialized in brand systems and investor pitch deck designs.",
      skills: "Brand Identity, Pitch Decks, Logo Design, Business Plans",
      rating: 5.0,
      completed_jobs: 18,
      avatar_url: "AY",
      portfolio_url: "https://dribbble.com"
    },
    {
      id: 4,
      name: "David Olatunji",
      title: "Visa Documentation Specialist",
      rate: 40.00,
      bio: "Expert immigration documentation consultant helping clients with Global Talent, study, and work visa petitions.",
      skills: "Visa Support, Letter Coordination, Statement of Purpose",
      rating: 4.7,
      completed_jobs: 31,
      avatar_url: "DO",
      portfolio_url: "https://nexusintellects.com"
    },
    {
      id: 5,
      name: "Sarah Miller",
      title: "Data Analyst & Python Instructor",
      rate: 42.00,
      bio: "Python developer and data analysis mentor for corporate cohorts. Specializes in building automated dashboards.",
      skills: "Python, SQL, Dashboards, Data Analytics",
      rating: 4.9,
      completed_jobs: 15,
      avatar_url: "SM",
      portfolio_url: "https://github.com"
    }
  ];

  const MOCK_JOBS = [
    {
      id: 1,
      title: "Academic Dissertation Editing & Formatting",
      category: "Nexus WriteLab",
      budget: 150000.00,
      description: "Need professional copy-editing, proofreading, and formatting check for a 120-page PhD thesis in international relations. Must follow Harvard referencing style. Vetted academics only.",
      deadline: "2026-07-15",
      skills: "Academic Writing, Research Methods",
      client_name: "Prof. Ademola",
      status: "open",
      created_at: "2026-06-01 09:00:00",
      hired_freelancer_id: null
    },
    {
      id: 2,
      title: "Executive CV & LinkedIn Makeover",
      category: "Career Development",
      budget: 45000.00,
      description: "Transitioning from HR Manager to Director of People Operations. Need a complete CV redesign, cover letter template, and LinkedIn profile optimization aligned with tech standards.",
      deadline: "2026-06-25",
      skills: "CV Design, Personal Branding, LinkedIn Optimization",
      client_name: "Victoria Davies",
      status: "contracted",
      created_at: "2026-06-02 10:00:00",
      hired_freelancer_id: 2
    },
    {
      id: 3,
      title: "Brand Identity & Pitch Deck for EdTech Startup",
      category: "Business Services",
      budget: 250000.00,
      description: "We are an early-stage education platform looking for a modern brand identity system (logo, typography, presentation template) and a 12-slide investor pitch deck for seed funding.",
      deadline: "2026-08-01",
      skills: "Brand Identity, Pitch Decks, Logo Design",
      client_name: "Kola Ventures",
      status: "open",
      created_at: "2026-06-03 14:00:00",
      hired_freelancer_id: null
    },
    {
      id: 4,
      title: "Visa Documentation Petition Letter Review",
      category: "Visa Documentation",
      budget: 80000.00,
      description: "Need a vetted visa petition consultant to review my letters of recommendation and draft the final petition letter for my UK Global Talent Visa application in research.",
      deadline: "2026-07-05",
      skills: "Visa Support, Statement of Purpose",
      client_name: "Dr. Tunde",
      status: "open",
      created_at: "2026-06-03 16:30:00",
      hired_freelancer_id: null
    },
    {
      id: 5,
      title: "Automated Sales Dashboard Setup in Excel",
      category: "NextPrep Academy",
      budget: 60000.00,
      description: "Need an automated sales reporting spreadsheet with custom pivot charts, KPIs, and clean data processing macro for a retail company.",
      deadline: "2026-06-30",
      skills: "Dashboards, Data Analytics",
      client_name: "Apex Retail",
      status: "completed",
      created_at: "2026-06-01 08:30:00",
      hired_freelancer_id: 5
    }
  ];

  const MOCK_PROPOSALS = [
    {
      id: 1,
      job_id: 2,
      freelancer_id: 2,
      freelancer_name: "Michael Chen",
      freelancer_title: "Career Strategy & Brand Designer",
      bid_amount: 45000.00,
      delivery_time: "5 Days",
      cover_letter: "I'd love to help you rewrite and optimize your executive CV and LinkedIn profile. I've worked with numerous HR leaders transitioning to tech and know exactly what recruiters are looking for.",
      status: "hired",
      created_at: "2026-06-02 14:00:00"
    },
    {
      id: 2,
      job_id: 2,
      freelancer_id: 1,
      freelancer_name: "Dr. Elizabeth Johnson",
      freelancer_title: "Academic Research Specialist",
      bid_amount: 50000.00,
      delivery_time: "7 Days",
      cover_letter: "Although my primary expertise is academic, I have extensive experience in professional proofreading and resume structural formatting.",
      status: "declined",
      created_at: "2026-06-02 15:30:00"
    },
    {
      id: 3,
      job_id: 5,
      freelancer_id: 5,
      freelancer_name: "Sarah Miller",
      freelancer_title: "Data Analyst & Python Instructor",
      bid_amount: 60000.00,
      delivery_time: "4 Days",
      cover_letter: "I have set up dozens of spreadsheet dashboards with macros and Python integrations. I can deliver a clean, interactive sales board in 4 days.",
      status: "hired",
      created_at: "2026-06-01 12:00:00"
    }
  ];

  const MOCK_CONTRACTS = [
    {
      id: 1,
      job_id: 2,
      freelancer_id: 2,
      client_name: "Victoria Davies",
      freelancer_name: "Michael Chen",
      budget: 45000.00,
      deadline: "2026-06-25",
      status: "active",
      created_at: "2026-06-02 18:00:00"
    },
    {
      id: 2,
      job_id: 5,
      freelancer_id: 5,
      client_name: "Apex Retail",
      freelancer_name: "Sarah Miller",
      budget: 60000.00,
      deadline: "2026-06-30",
      status: "completed",
      created_at: "2026-06-01 16:00:00"
    }
  ];

  const MOCK_MESSAGES = [
    {
      id: 1,
      contract_id: 1,
      sender: "freelancer",
      text: "Hi Victoria! Thanks for hiring me. I've looked at your current CV draft. Could you please send me your target job descriptions so I can tailor the keywords?",
      timestamp: "2026-06-03 10:00:00",
      is_work_submission: 0,
      submission_file_url: null
    },
    {
      id: 2,
      contract_id: 1,
      sender: "client",
      text: "Hi Michael, excited to work together! Here are the target roles. I want to highlight my leadership in scaling remote teams.",
      timestamp: "2026-06-03 11:15:00",
      is_work_submission: 0,
      submission_file_url: null
    },
    {
      id: 3,
      contract_id: 2,
      sender: "freelancer",
      text: "Hi Apex team, starting on the dashboard macro today.",
      timestamp: "2026-06-01 16:30:00",
      is_work_submission: 0,
      submission_file_url: null
    },
    {
      id: 4,
      contract_id: 2,
      sender: "freelancer",
      text: "The dashboard is complete and fully automated. I have uploaded it and linked it here. Let me know if you need any adjustments!",
      timestamp: "2026-06-03 15:30:00",
      is_work_submission: 1,
      submission_file_url: "https://nexus-intellects.com/work/apex-dashboard-v1.xlsx"
    },
    {
      id: 5,
      contract_id: 2,
      sender: "client",
      text: "Amazing work, Sarah! The macros run perfectly and the KPI charts are clean. Releasing payment now.",
      timestamp: "2026-06-03 17:00:00",
      is_work_submission: 0,
      submission_file_url: null
    }
  ];

  const DEFAULT_USERS = [];

  const DEFAULT_MILESTONES = [
    { id: 1, contract_id: 1, title: "Initial Milestone - Executive CV Revision", amount: 20000.00, status: "funded", created_at: "2026-06-02 18:05:00" },
    { id: 2, contract_id: 1, title: "LinkedIn Makeover & Strategy", amount: 25000.00, status: "funded", created_at: "2026-06-02 18:05:00" },
    { id: 3, contract_id: 2, title: "Dashboard Macro & Automations", amount: 60000.00, status: "released", created_at: "2026-06-01 16:05:00" }
  ];

  const DEFAULT_NOTIFICATIONS = [
    { id: 1, user_id: 1, title: "Welcome to Nexus!", message: "Welcome to the Nexus Expert Network. Start building your profile or browse approved projects.", type: "welcome", is_read: 0, created_at: "2026-06-04 12:00:00" },
    { id: 2, user_id: 7, title: "New Proposal Received", message: "Michael Chen submitted a proposal for your job 'Executive CV & LinkedIn Makeover'.", type: "bid_received", is_read: 1, created_at: "2026-06-02 14:05:00" },
    { id: 3, user_id: 2, title: "Contract Awarded!", message: "Congratulations! Client Victoria Davies has hired you for the job 'Executive CV & LinkedIn Makeover'.", type: "contract_hired", is_read: 0, created_at: "2026-06-02 18:00:00" },
    { id: 4, user_id: 5, title: "Contract Completed!", message: "Client approved and released escrow funds for your contract.", type: "payment_released", is_read: 0, created_at: "2026-06-03 17:05:00" }
  ];

  function seedLocalStorage() {
    if (!storage.getItem('m_jobs')) {
      storage.setItem('m_jobs', JSON.stringify(MOCK_JOBS));
      storage.setItem('m_freelancers', JSON.stringify(MOCK_FREELANCERS));
      storage.setItem('m_proposals', JSON.stringify(MOCK_PROPOSALS));
      storage.setItem('m_contracts', JSON.stringify(MOCK_CONTRACTS));
      storage.setItem('m_messages', JSON.stringify(MOCK_MESSAGES));
      storage.setItem('m_profile', JSON.stringify(DEFAULT_PROFILE));
      storage.setItem('m_milestones', JSON.stringify(DEFAULT_MILESTONES));
      storage.setItem('m_notifications', JSON.stringify(DEFAULT_NOTIFICATIONS));
      storage.setItem('m_disputes', JSON.stringify([]));
    }
  }

  // --- Database CRUD Adaptor (API or LocalStorage Fallback) ---
  const db = {
    get: function(key) {
      return JSON.parse(storage.getItem(key)) || [];
    },
    set: function(key, val) {
      storage.setItem(key, JSON.stringify(val));
    },
    
    // Profiles
    getProfile: async function() {
      if (apiMode) {
        try {
          let url = currentUser && currentUser.role === 'client' ? `${API_BASE}/clients/profile` : `${API_BASE}/freelancers/profile`;
          let res = await fetch(url);
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      if (currentUser && currentUser.role === 'client') {
        let clients = JSON.parse(storage.getItem('m_clients')) || [];
        let client = clients.find(c => c.user_id === currentUser.id);
        return client || { name: currentUser.name, company: 'Personal Account', bio: '' };
      }
      return JSON.parse(storage.getItem('m_profile')) || DEFAULT_PROFILE;
    },
    updateProfile: async function(profileData) {
      if (apiMode) {
        try {
          let url = currentUser && currentUser.role === 'client' ? `${API_BASE}/clients/profile` : `${API_BASE}/freelancers/profile`;
          let res = await fetch(url, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(profileData)
          });
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      if (currentUser && currentUser.role === 'client') {
        let clients = JSON.parse(storage.getItem('m_clients')) || [];
        let index = clients.findIndex(c => c.user_id === currentUser.id);
        let updated = { id: currentUser.id, user_id: currentUser.id, name: profileData.name, company: profileData.company || 'Personal Account', bio: profileData.bio || '' };
        if (index !== -1) {
          clients[index] = { ...clients[index], ...updated };
        } else {
          clients.push(updated);
        }
        storage.setItem('m_clients', JSON.stringify(clients));
        return updated;
      } else {
        storage.setItem('m_profile', JSON.stringify(profileData));
        let freelancers = this.get('m_freelancers');
        let index = freelancers.findIndex(f => f.user_id === (currentUser ? currentUser.id : 1));
        if (index !== -1) {
          freelancers[index] = {...freelancers[index], ...profileData};
          this.set('m_freelancers', freelancers);
        }
        return profileData;
      }
    },
 
    // Jobs
    getJobs: async function(category='', query='') {
      if (apiMode) {
        try {
          let url = `${API_BASE}/jobs?category=${encodeURIComponent(category)}&q=${encodeURIComponent(query)}`;
          let res = await fetch(url);
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      let jobs = this.get('m_jobs');
      return jobs.filter(job => {
        let matchCat = !category || job.category === category;
        let matchQ = !query || job.title.toLowerCase().includes(query.toLowerCase()) || job.description.toLowerCase().includes(query.toLowerCase()) || job.skills.toLowerCase().includes(query.toLowerCase());
        return matchCat && matchQ;
      });
    },
    getJob: async function(id) {
      if (apiMode) {
        try {
          let res = await fetch(`${API_BASE}/jobs/${id}`);
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      let jobs = this.get('m_jobs');
      return jobs.find(j => j.id === id);
    },
    postJob: async function(jobData) {
      if (apiMode) {
        try {
          let res = await fetch(`${API_BASE}/jobs`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(jobData)
          });
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      let jobs = this.get('m_jobs');
      let newJob = {
        id: jobs.length ? Math.max(...jobs.map(j => j.id)) + 1 : 1,
        client_id: currentUser ? currentUser.id : 6,
        ...jobData,
        status: 'open',
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
        hired_freelancer_id: null
      };
      jobs.unshift(newJob);
      this.set('m_jobs', jobs);
      return newJob;
    },
 
    // Proposals
    getProposals: async function(jobId=null, freelancerId=null) {
      if (apiMode) {
        try {
          let url = `${API_BASE}/proposals`;
          if (jobId || freelancerId) {
            url += '?';
            if (jobId) url += `job_id=${jobId}&`;
            if (freelancerId) url += `freelancer_id=${freelancerId}`;
          }
          let res = await fetch(url);
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      let proposals = this.get('m_proposals');
      return proposals.filter(p => {
        let matchJob = !jobId || p.job_id === parseInt(jobId);
        let matchFree = !freelancerId || p.freelancer_id === parseInt(freelancerId);
        return matchJob && matchFree;
      });
    },
    submitProposal: async function(proposalData) {
      if (apiMode) {
        try {
          let res = await fetch(`${API_BASE}/proposals`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(proposalData)
          });
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      let proposals = this.get('m_proposals');
      let profile = await this.getProfile();
      let newProp = {
        id: proposals.length ? Math.max(...proposals.map(p => p.id)) + 1 : 1,
        job_id: parseInt(proposalData.job_id),
        freelancer_id: currentUser ? currentUser.id : 1,
        freelancer_name: profile.name,
        freelancer_title: profile.title || 'Specialist',
        bid_amount: float(proposalData.bid_amount),
        delivery_time: proposalData.delivery_time || '7 Days',
        cover_letter: proposalData.cover_letter,
        status: 'pending',
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
      };
      proposals.unshift(newProp);
      this.set('m_proposals', proposals);
      
      let jobs = this.get('m_jobs');
      let job = jobs.find(j => j.id === parseInt(proposalData.job_id));
      if (job) {
        let users = JSON.parse(storage.getItem('m_users')) || DEFAULT_USERS;
        let uRow = users.find(u => u.name === job.client_name);
        let targetId = uRow ? uRow.id : 6;
        
        let notifs = JSON.parse(storage.getItem('m_notifications')) || [];
        notifs.unshift({
          id: notifs.length ? Math.max(...notifs.map(n => n.id)) + 1 : 1,
          user_id: targetId,
          title: 'New Proposal Received',
          message: `${profile.name} submitted a proposal for '${job.title}'.`,
          type: 'bid_received',
          is_read: 0,
          created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
        });
        storage.setItem('m_notifications', JSON.stringify(notifs));
      }
      return newProp;
    },
    hireProposal: async function(proposalId, paymentRef = 'ZenithTransfer-Default-998') {
      if (apiMode) {
        try {
          let res = await fetch(`${API_BASE}/proposals/${proposalId}/hire`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ payment_ref: paymentRef })
          });
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      let proposals = this.get('m_proposals');
      let prop = proposals.find(p => p.id === proposalId);
      if (!prop) return null;
      
      prop.status = 'hired';
      proposals.forEach(p => {
        if (p.job_id === prop.job_id && p.id !== proposalId) p.status = 'declined';
      });
      this.set('m_proposals', proposals);
 
      let jobs = this.get('m_jobs');
      let job = jobs.find(j => j.id === prop.job_id);
      if (job) {
        job.status = 'contracted';
        job.hired_freelancer_id = prop.freelancer_id;
        this.set('m_jobs', jobs);
      }
 
      let contracts = this.get('m_contracts');
      let newContractId = contracts.length ? Math.max(...contracts.map(c => c.id)) + 1 : 1;
      let newContract = {
        id: newContractId,
        job_id: prop.job_id,
        freelancer_id: prop.freelancer_id,
        client_id: currentUser ? currentUser.id : 6,
        client_name: job ? job.client_name : 'Anonymous Client',
        freelancer_name: prop.freelancer_name,
        budget: prop.bid_amount,
        deadline: job ? job.deadline : '',
        status: 'active',
        payment_ref: paymentRef,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
      };
      contracts.unshift(newContract);
      this.set('m_contracts', contracts);
 
      let milestones = JSON.parse(storage.getItem('m_milestones')) || [];
      milestones.push({
        id: milestones.length ? Math.max(...milestones.map(m => m.id)) + 1 : 1,
        contract_id: newContractId,
        title: 'Project Milestone (Full Budget)',
        amount: prop.bid_amount,
        status: 'funded',
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
      });
      storage.setItem('m_milestones', JSON.stringify(milestones));
 
      let messages = this.get('m_messages');
      messages.push({
        id: messages.length ? Math.max(...messages.map(m => m.id)) + 1 : 1,
        contract_id: newContractId,
        sender: 'client',
        text: `🔐 Escrow Funding Secured: Bank Transfer reference '${paymentRef}' has been received and verified by Nexus Escrow. Budget ₦${prop.bid_amount.toLocaleString()} is locked in Nexus Intellect Limited Escrow Account.`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        is_work_submission: 0,
        submission_file_url: null
      });
      messages.push({
        id: messages.length ? Math.max(...messages.map(m => m.id)) + 1 : 2,
        contract_id: newContractId,
        sender: 'freelancer',
        text: `Hi ${newContract.client_name}! Thank you for hiring me for this project. I'm ready to get started. Please share any further instructions or source files here.`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        is_work_submission: 0,
        submission_file_url: null
      });
      this.set('m_messages', messages);
 
      let notifs = JSON.parse(storage.getItem('m_notifications')) || [];
      let users = JSON.parse(storage.getItem('m_users')) || DEFAULT_USERS;
      let targetUser = users.find(u => u.id === prop.freelancer_id);
      let targetUserId = targetUser ? targetUser.id : prop.freelancer_id;
      
      notifs.unshift({
        id: notifs.length ? Math.max(...notifs.map(n => n.id)) + 1 : 1,
        user_id: targetUserId,
        title: 'Contract Awarded!',
        message: `Congratulations! Client ${newContract.client_name} hired you for '${job ? job.title : ''}'.`,
        type: 'contract_hired',
        is_read: 0,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
      });
      storage.setItem('m_notifications', JSON.stringify(notifs));
 
      return newContract;
    },
 
    // Contracts
    getContracts: async function(role) {
      if (apiMode) {
        try {
          let res = await fetch(`${API_BASE}/contracts?role=${role}`);
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      let contracts = this.get('m_contracts');
      if (role === 'freelancer') {
        return contracts.filter(c => c.freelancer_id === (currentUser ? currentUser.id : 1));
      } else {
        return contracts.filter(c => c.client_id === (currentUser ? currentUser.id : 6));
      }
    },
    completeContract: async function(contractId) {
      if (apiMode) {
        try {
          let res = await fetch(`${API_BASE}/contracts/${contractId}/complete`, { method: 'POST' });
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      let contracts = this.get('m_contracts');
      let contract = contracts.find(c => c.id === contractId);
      if (contract) {
        contract.status = 'completed';
        this.set('m_contracts', contracts);
      }
 
      let jobs = this.get('m_jobs');
      let job = jobs.find(j => j.id === contract.job_id);
      if (job) {
        job.status = 'completed';
        this.set('m_jobs', jobs);
      }
 
      let freelancers = this.get('m_freelancers');
      let f = freelancers.find(free => free.id === contract.freelancer_id);
      if (f) {
        f.completed_jobs = (f.completed_jobs || 0) + 1;
        this.set('m_freelancers', freelancers);
      }
 
      let milestones = JSON.parse(storage.getItem('m_milestones')) || [];
      milestones.forEach(m => {
        if (m.contract_id === contractId) m.status = 'released';
      });
      storage.setItem('m_milestones', JSON.stringify(milestones));
 
      let messages = this.get('m_messages');
      messages.push({
        id: messages.length ? Math.max(...messages.map(m => m.id)) + 1 : 1,
        contract_id: contractId,
        sender: 'client',
        text: "Project completed! Client approved and released all escrow milestone funds.",
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        is_work_submission: 0,
        submission_file_url: null
      });
      this.set('m_messages', messages);
      
      let notifs = JSON.parse(storage.getItem('m_notifications')) || [];
      notifs.unshift({
        id: notifs.length ? Math.max(...notifs.map(n => n.id)) + 1 : 1,
        user_id: contract.freelancer_id,
        title: 'Contract Completed!',
        message: 'Client approved and released escrow funds for your contract.',
        type: 'payment_released',
        is_read: 0,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
      });
      storage.setItem('m_notifications', JSON.stringify(notifs));
      
      return { success: true };
    },
 
    // Messages / Chat
    getMessages: async function(contractId) {
      if (apiMode) {
        try {
          let res = await fetch(`${API_BASE}/contracts/${contractId}/messages`);
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      let messages = this.get('m_messages');
      return messages.filter(m => m.contract_id === contractId);
    },
    sendMessage: async function(contractId, msgData) {
      if (apiMode) {
        try {
          let res = await fetch(`${API_BASE}/contracts/${contractId}/messages`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(msgData)
          });
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      let messages = this.get('m_messages');
      let newMsg = {
        id: messages.length ? Math.max(...messages.map(m => m.id)) + 1 : 1,
        contract_id: contractId,
        sender: msgData.sender,
        text: msgData.text,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        is_work_submission: msgData.is_work_submission ? 1 : 0,
        submission_file_url: msgData.submission_file_url || null
      };
      messages.push(newMsg);
      this.set('m_messages', messages);
 
      let contracts = this.get('m_contracts');
      let contract = contracts.find(c => c.id === contractId);
      if (contract) {
        let otherUserId = null;
        let users = JSON.parse(storage.getItem('m_users')) || DEFAULT_USERS;
        
        if (msgData.sender === 'freelancer') {
          let clientUser = users.find(u => u.name === contract.client_name);
          if (clientUser) otherUserId = clientUser.id;
        } else {
          otherUserId = contract.freelancer_id;
        }
        
        if (otherUserId) {
          let notifs = JSON.parse(storage.getItem('m_notifications')) || [];
          notifs.unshift({
            id: notifs.length ? Math.max(...notifs.map(n => n.id)) + 1 : 1,
            user_id: otherUserId,
            title: `New Message from ${msgData.sender === 'freelancer' ? contract.freelancer_name : contract.client_name}`,
            message: msgData.text.substring(0, 60) + (msgData.text.length > 60 ? '...' : ''),
            type: 'message',
            is_read: 0,
            created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
          });
          storage.setItem('m_notifications', JSON.stringify(notifs));
        }
      }
 
      if (msgData.sender === 'client' && !msgData.is_work_submission) {
        if (contract && contract.status === 'active' && contract.freelancer_id > 1) {
          setTimeout(() => {
            let messages = this.get('m_messages');
            messages.push({
              id: messages.length ? Math.max(...messages.map(m => m.id)) + 1 : 1,
              contract_id: contractId,
              sender: 'freelancer',
              text: `Got it, ${contract.client_name}. I will look into this and update you shortly. Thank you!`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              is_work_submission: 0,
              submission_file_url: null
            });
            this.set('m_messages', messages);
            if (activeChatContractId === contractId) {
              renderChatFeed(contractId);
            }
          }, 1500);
        }
      }
      return newMsg;
    },
 
    // Milestones Adaptors
    getMilestones: async function(contractId) {
      if (apiMode) {
        try {
          let res = await fetch(`${API_BASE}/contracts/${contractId}/milestones`);
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      let milestones = JSON.parse(storage.getItem('m_milestones')) || [];
      let contractMilestones = milestones.filter(m => m.contract_id === contractId);
      if (contractMilestones.length === 0) {
        let contracts = this.get('m_contracts');
        let contract = contracts.find(c => c.id === contractId);
        if (contract) {
          let defaultM = {
            id: milestones.length ? Math.max(...milestones.map(m => m.id)) + 1 : 1,
            contract_id: contractId,
            title: 'Project Milestone (Full Budget)',
            amount: contract.budget,
            status: contract.status === 'completed' ? 'released' : 'funded',
            created_at: contract.created_at
          };
          milestones.push(defaultM);
          storage.setItem('m_milestones', JSON.stringify(milestones));
          contractMilestones = [defaultM];
        }
      }
      return contractMilestones;
    },
    releaseMilestone: async function(contractId, milestoneId) {
      if (apiMode) {
        try {
          let res = await fetch(`${API_BASE}/contracts/${contractId}/milestones/${milestoneId}/release`, { method: 'POST' });
          if (res.ok) return true;
        } catch(e) { console.error('API Error:', e); }
      }
      let milestones = JSON.parse(storage.getItem('m_milestones')) || [];
      let m = milestones.find(mil => mil.id === milestoneId);
      if (m) {
        m.status = 'released';
        storage.setItem('m_milestones', JSON.stringify(milestones));
        
        let messages = this.get('m_messages');
        messages.push({
          id: messages.length ? Math.max(...messages.map(mg => mg.id)) + 1 : 1,
          contract_id: contractId,
          sender: 'client',
          text: `Escrow Milestone Released: '${m.title}' (₦${m.amount.toLocaleString()}) has been released to your account.`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          is_work_submission: 0,
          submission_file_url: null
        });
        this.set('m_messages', messages);
        
        let contracts = this.get('m_contracts');
        let contract = contracts.find(c => c.id === contractId);
        if (contract) {
          let notifs = JSON.parse(storage.getItem('m_notifications')) || [];
          notifs.unshift({
            id: notifs.length ? Math.max(...notifs.map(n => n.id)) + 1 : 1,
            user_id: contract.freelancer_id,
            title: 'Milestone Funds Released',
            message: `Client released ₦${m.amount.toLocaleString()} for '${m.title}'.`,
            type: 'payment_released',
            is_read: 0,
            created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
          });
          storage.setItem('m_notifications', JSON.stringify(notifs));
        }
      }
      return true;
    },
    requestMilestone: async function(contractId, milestoneId) {
      if (apiMode) {
        try {
          let res = await fetch(`${API_BASE}/contracts/${contractId}/milestones/${milestoneId}/request`, { method: 'POST' });
          if (res.ok) return true;
        } catch(e) { console.error('API Error:', e); }
      }
      let milestones = JSON.parse(storage.getItem('m_milestones')) || [];
      let m = milestones.find(mil => mil.id === milestoneId);
      if (m) {
        m.status = 'requested';
        storage.setItem('m_milestones', JSON.stringify(milestones));
        
        let messages = this.get('m_messages');
        messages.push({
          id: messages.length ? Math.max(...messages.map(mg => mg.id)) + 1 : 1,
          contract_id: contractId,
          sender: 'freelancer',
          text: `Payment Request: Freelancer has requested release of Escrow Milestone '${m.title}' (₦${m.amount.toLocaleString()}).`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          is_work_submission: 0,
          submission_file_url: null
        });
        this.set('m_messages', messages);
        
        let contracts = this.get('m_contracts');
        let contract = contracts.find(c => c.id === contractId);
        if (contract) {
          let users = JSON.parse(storage.getItem('m_users')) || DEFAULT_USERS;
          let clientName = contract.client_name;
          let userRow = users.find(u => u.name === clientName);
          let targetUserId = userRow ? userRow.id : 6;
          
          let notifs = JSON.parse(storage.getItem('m_notifications')) || [];
          notifs.unshift({
            id: notifs.length ? Math.max(...notifs.map(n => n.id)) + 1 : 1,
            user_id: targetUserId,
            title: 'Milestone Release Requested',
            message: `Freelancer requested release of ₦${m.amount.toLocaleString()} for '${m.title}'.`,
            type: 'bid_received',
            is_read: 0,
            created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
          });
          storage.setItem('m_notifications', JSON.stringify(notifs));
        }
      }
      return true;
    },

    // Disputes Adaptors
    getDisputes: async function() {
      if (apiMode) {
        try {
          let res = await fetch(`${API_BASE}/disputes`);
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      let disputes = JSON.parse(storage.getItem('m_disputes')) || [];
      let contracts = this.get('m_contracts');
      let jobs = this.get('m_jobs');
      return disputes.map(d => {
        let contract = contracts.find(c => c.id === d.contract_id) || {};
        let job = jobs.find(j => j.id === contract.job_id) || {};
        return {
          ...d,
          client_name: contract.client_name || 'Client',
          freelancer_name: contract.freelancer_name || 'Freelancer',
          budget: contract.budget || 0,
          job_title: job.title || 'Project'
        };
      });
    },

    fileDispute: async function(contractId, reason) {
      if (apiMode) {
        try {
          let res = await fetch(`${API_BASE}/contracts/${contractId}/dispute`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ reason })
          });
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      let disputes = JSON.parse(storage.getItem('m_disputes')) || [];
      let newDispute = {
        id: disputes.length ? Math.max(...disputes.map(d => d.id)) + 1 : 1,
        contract_id: contractId,
        status: 'open',
        reason: reason,
        client_response: null,
        resolution_type: null,
        escrow_resolution: null,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
        resolved_at: null
      };
      disputes.push(newDispute);
      storage.setItem('m_disputes', JSON.stringify(disputes));

      let contracts = this.get('m_contracts');
      let contract = contracts.find(c => c.id === contractId);
      if (contract) {
        contract.status = 'disputed';
        this.set('m_contracts', contracts);
        
        let jobs = this.get('m_jobs');
        let job = jobs.find(j => j.id === contract.job_id);
        if (job) {
          job.status = 'disputed';
          this.set('m_jobs', jobs);
        }

        let messages = this.get('m_messages');
        messages.push({
          id: messages.length ? Math.max(...messages.map(m => m.id)) + 1 : 1,
          contract_id: contractId,
          sender: 'freelancer',
          text: `⚠️ Dispute Filed: Freelancer has initiated a dispute. Reason: "${reason}". Escrow payment processing is suspended pending mediation.`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          is_work_submission: 0,
          submission_file_url: null
        });
        this.set('m_messages', messages);

        let users = JSON.parse(storage.getItem('m_users')) || DEFAULT_USERS;
        let clientUser = users.find(u => u.name === contract.client_name);
        if (clientUser) {
          let notifs = JSON.parse(storage.getItem('m_notifications')) || [];
          notifs.unshift({
            id: notifs.length ? Math.max(...notifs.map(n => n.id)) + 1 : 1,
            user_id: clientUser.id,
            title: 'Dispute Opened on Contract',
            message: `Freelancer filed a dispute for contract '${contract.client_name}'. Please submit a response.`,
            type: 'dispute_opened',
            is_read: 0,
            created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
          });
          storage.setItem('m_notifications', JSON.stringify(notifs));
        }
      }
      return { success: true, status: 'open' };
    },

    respondDispute: async function(contractId, responseText) {
      if (apiMode) {
        try {
          let res = await fetch(`${API_BASE}/contracts/${contractId}/dispute/respond`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ response: responseText })
          });
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      let disputes = JSON.parse(storage.getItem('m_disputes')) || [];
      let dispute = disputes.find(d => d.contract_id === contractId);
      if (dispute) {
        dispute.status = 'responded';
        dispute.client_response = responseText;
        storage.setItem('m_disputes', JSON.stringify(disputes));

        let contracts = this.get('m_contracts');
        let contract = contracts.find(c => c.id === contractId);
        if (contract) {
          let messages = this.get('m_messages');
          messages.push({
            id: messages.length ? Math.max(...messages.map(m => m.id)) + 1 : 1,
            contract_id: contractId,
            sender: 'client',
            text: `⚠️ Dispute Response Submitted: Client Victoria Davies has responded. Response: "${responseText}". Escrow Mediation Team notified.`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            is_work_submission: 0,
            submission_file_url: null
          });
          this.set('m_messages', messages);

          let notifs = JSON.parse(storage.getItem('m_notifications')) || [];
          notifs.unshift({
            id: notifs.length ? Math.max(...notifs.map(n => n.id)) + 1 : 1,
            user_id: contract.freelancer_id,
            title: 'Dispute Response Received',
            message: 'Client responded to your dispute. Nexus Escrow Agent is reviewing the ticket.',
            type: 'dispute_responded',
            is_read: 0,
            created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
          });
          storage.setItem('m_notifications', JSON.stringify(notifs));
        }
      }
      return { success: true, status: 'responded' };
    },

    resolveDispute: async function(contractId, resolutionType, notes) {
      if (apiMode) {
        try {
          let res = await fetch(`${API_BASE}/contracts/${contractId}/dispute/resolve`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ resolution_type: resolutionType, escrow_resolution: notes })
          });
          if (res.ok) return await res.json();
        } catch(e) { console.error('API Error:', e); }
      }
      let disputes = JSON.parse(storage.getItem('m_disputes')) || [];
      let dispute = disputes.find(d => d.contract_id === contractId);
      if (dispute) {
        dispute.status = 'resolved';
        dispute.resolution_type = resolutionType;
        dispute.escrow_resolution = notes;
        dispute.resolved_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
        storage.setItem('m_disputes', JSON.stringify(disputes));

        let contracts = this.get('m_contracts');
        let contract = contracts.find(c => c.id === contractId);
        if (contract) {
          contract.status = 'completed';
          this.set('m_contracts', contracts);

          let jobs = this.get('m_jobs');
          let job = jobs.find(j => j.id === contract.job_id);
          if (job) {
             job.status = 'completed';
             this.set('m_jobs', jobs);
          }

          let milestones = JSON.parse(storage.getItem('m_milestones')) || [];
          let resolutionLabel = '';
          if (resolutionType === 'release') {
            milestones.forEach(m => {
              if (m.contract_id === contractId) m.status = 'released';
            });
            resolutionLabel = "100% Funds Released to Freelancer";
          } else if (resolutionType === 'refund') {
            milestones.forEach(m => {
              if (m.contract_id === contractId) m.status = 'refunded';
            });
            resolutionLabel = "100% Funds Refunded to Client";
          } else {
            milestones = milestones.filter(m => m.contract_id !== contractId);
            let half = contract.budget / 2.0;
            milestones.push({
              id: milestones.length ? Math.max(...milestones.map(m => m.id)) + 1 : 1,
              contract_id: contractId,
              title: 'Dispute Split (Freelancer Payout)',
              amount: half,
              status: 'released',
              created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
            });
            milestones.push({
              id: milestones.length ? Math.max(...milestones.map(m => m.id)) + 1 : 2,
              contract_id: contractId,
              title: 'Dispute Split (Client Refund)',
              amount: half,
              status: 'refunded',
              created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
            });
            resolutionLabel = "50/50 Split Payout & Refund";
          }
          storage.setItem('m_milestones', JSON.stringify(milestones));

          if (resolutionType !== 'refund') {
            let freelancers = this.get('m_freelancers');
            let f = freelancers.find(free => free.id === contract.freelancer_id);
            if (f) {
              f.completed_jobs = (f.completed_jobs || 0) + 1;
              this.set('m_freelancers', freelancers);
            }
          }

          let messages = this.get('m_messages');
          messages.push({
            id: messages.length ? Math.max(...messages.map(m => m.id)) + 1 : 1,
            contract_id: contractId,
            sender: 'client',
            text: `🏁 Dispute Resolved by Escrow Mediator: [${resolutionLabel}]. Mediation Notes: "${notes}". Escrow transaction finalized.`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            is_work_submission: 0,
            submission_file_url: null
          });
          this.set('m_messages', messages);

          let notifs = JSON.parse(storage.getItem('m_notifications')) || [];
          notifs.unshift({
            id: notifs.length ? Math.max(...notifs.map(n => n.id)) + 1 : 1,
            user_id: contract.freelancer_id,
            title: 'Dispute Resolution Issued',
            message: `Dispute resolved by Escrow: ${resolutionLabel}.`,
            type: 'dispute_resolved',
            is_read: 0,
            created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
          });
          
          let users = JSON.parse(storage.getItem('m_users')) || DEFAULT_USERS;
          let clientUser = users.find(u => u.name === contract.client_name);
          if (clientUser) {
            notifs.unshift({
              id: notifs.length ? Math.max(...notifs.map(n => n.id)) + 1 : 1,
              user_id: clientUser.id,
              title: 'Dispute Resolution Issued',
              message: `Dispute resolved by Escrow: ${resolutionLabel}.`,
              type: 'dispute_resolved',
              is_read: 0,
              created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
            });
          }
          storage.setItem('m_notifications', JSON.stringify(notifs));
        }
      }
      return { success: true, status: 'resolved', resolution_type: resolutionType };
    }
  };

  // Helper float parser
  function float(val) {
    let f = parseFloat(val);
    return isNaN(f) ? 0.0 : f;
  }

  // --- Check API Status ---
  async function checkApiConnection() {
    const indicator = document.getElementById('api-status');
    const dot = indicator.querySelector('.status-dot');
    const text = indicator.querySelector('.status-text');
    
    try {
      let res = await fetch(`${API_BASE}/auth/me`);
      if (res.ok) {
        apiMode = true;
        dot.className = 'status-dot status-dot--online';
        text.textContent = 'Connected to private workspace';
        if (betaStatus) betaStatus.textContent = 'Private beta access only. Approved members can sign in when issued credentials by Nexus.';
      } else {
        throw new Error('API offline');
      }
    } catch (err) {
      apiMode = false;
      dot.className = 'status-dot status-dot--offline';
      text.textContent = 'Private workspace unavailable';
      if (betaStatus) betaStatus.textContent = 'Private beta access only. The authenticated workspace requires the production server to be online.';
    }
    
    // Once mode is determined, verify authentication state
    await checkAuth();
  }

  // --- Authentication Handlers ---
  
  async function checkAuth() {
    if (apiMode) {
      try {
        let res = await fetch(`${API_BASE}/auth/me`);
        if (res.ok) {
          let data = await res.json();
          if (data.logged_in) {
            currentUser = data;
            storage.setItem('m_session_user', JSON.stringify(currentUser));
            await onUserAuthenticated();
            return;
          } else {
            storage.setItem('m_session_user', '');
          }
        }
      } catch (e) {
        console.error('Auth Check API error:', e);
      }
    } else {
      storage.setItem('m_session_user', '');
    }
    
    // If not authenticated, keep the polished public landing visible.
    currentUser = null;
    showPublicLanding();
  }

  async function onUserAuthenticated() {
    closeAuthOverlay();
    showAppShell();
    
    document.getElementById('user-menu').style.display = 'flex';
    document.getElementById('btn-get-started-nav').style.display = 'none';
    
    document.getElementById('navbar-user-name').textContent = currentUser.name;
    document.getElementById('navbar-user-role').textContent = currentUser.role === 'freelancer' ? 'Freelancer' : (currentUser.role === 'client' ? 'Client' : 'Escrow Mediator');
    
    let initials = currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    document.getElementById('navbar-user-avatar').textContent = initials;
    
    currentRole = currentUser.role;
    
    // Enforce registered role workspace and lock view selection
    if (currentRole === 'freelancer') {
      document.getElementById('client-pane').classList.remove('active');
      document.getElementById('escrow-agent-pane').classList.remove('active');
      document.getElementById('freelancer-pane').classList.add('active');
    } else if (currentRole === 'client') {
      document.getElementById('freelancer-pane').classList.remove('active');
      document.getElementById('escrow-agent-pane').classList.remove('active');
      document.getElementById('client-pane').classList.add('active');
    } else if (currentRole === 'escrow') {
      document.getElementById('freelancer-pane').classList.remove('active');
      document.getElementById('client-pane').classList.remove('active');
      document.getElementById('escrow-agent-pane').classList.add('active');
    }
    
    // Hide role switch interface so freelancers and clients only see their own workspaces
    document.querySelector('.role-selector').style.display = 'none';
    
    await loadNotifications();
    await refreshAllViews();
    
    // Setup regular notifications checks
    setInterval(loadNotifications, 8000);
  }

  async function loadNotifications() {
    if (!currentUser) return;
    let notifs = [];
    if (apiMode) {
      try {
        let res = await fetch(`${API_BASE}/notifications`);
        if (res.ok) notifs = await res.json();
      } catch (e) { console.error('Notifications fetch failed:', e); }
    } else {
      let allNotifs = JSON.parse(storage.getItem('m_notifications')) || [];
      notifs = allNotifs.filter(n => n.user_id === currentUser.id);
    }
    
    let unreadCount = notifs.filter(n => !n.is_read).length;
    let badge = document.getElementById('notif-badge');
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
    
    let container = document.getElementById('notif-dropdown-list');
    container.innerHTML = '';
    
    if (notifs.length === 0) {
      container.innerHTML = '<div class="notif-empty">No notifications</div>';
      return;
    }
    
    notifs.forEach(n => {
      let item = document.createElement('div');
      item.className = `notif-item ${n.is_read ? '' : 'unread'}`;
      item.innerHTML = `
        <div class="notif-item__title">${escapeHtml(n.title)}</div>
        <div class="notif-item__desc">${escapeHtml(n.message)}</div>
        <span class="notif-item__time">${n.created_at}</span>
      `;
      
      item.addEventListener('click', async () => {
        if (apiMode) {
          try {
            await fetch(`${API_BASE}/notifications/mark-read`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ id: n.id })
            });
          } catch(e) {}
        } else {
          let allNotifs = JSON.parse(storage.getItem('m_notifications')) || [];
          let target = allNotifs.find(an => an.id === n.id);
          if (target) target.is_read = 1;
          storage.setItem('m_notifications', JSON.stringify(allNotifs));
        }
        await loadNotifications();
      });
      container.appendChild(item);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  async function handleLogin(email, password) {
    if (apiMode) {
      try {
        let res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ email, password })
        });
        let data = await res.json();
        if (res.ok) {
          currentUser = data;
          storage.setItem('m_session_user', JSON.stringify(currentUser));
          await onUserAuthenticated();
          window.showToast(`Welcome back, ${currentUser.name}!`, "success");
          return { success: true };
        } else {
          return { success: false, error: data.error || 'Invalid credentials' };
        }
      } catch (e) {
        return { success: false, error: 'Cannot reach the authentication server' };
      }
    }
    return { success: false, error: 'Private workspace login is unavailable until the production server is online.' };
  }

  async function handleRegister(name, email, password, role) {
    if (apiMode) {
      try {
        let res = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ name, email, password, role })
        });
        let data = await res.json();
        if (res.ok) {
          currentUser = data;
          storage.setItem('m_session_user', JSON.stringify(currentUser));
          await onUserAuthenticated();
          window.showToast("Registration successful! Welcome to Nexus.", "success");
          window.showToast(`Welcome back, ${currentUser.name}!`, "success");
          return { success: true };
        } else {
          return { success: false, error: data.error || 'Failed to register account' };
        }
      } catch (e) {
        return { success: false, error: 'Network communication failure' };
      }
    }
    return { success: false, error: 'Public registration is closed during private beta. Please request access through Nexus.' };
  }

  async function handleLogout() {
    if (apiMode) {
      try {
        await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
      } catch (e) {}
    }
    currentUser = null;
    storage.setItem('m_session_user', '');
    
    showPublicLanding();
    
    closeWorkspace();
    window.showToast("Logged out successfully.", "info");
  }

  // --- Render Views & Controllers ---

  async function refreshAllViews() {
    await renderStats();
    if (currentRole === 'freelancer') {
      await renderJobsList();
      await renderProposalsTable();
      await renderFreelancerContracts();
      await populateProfileForm();
    } else if (currentRole === 'client') {
      await renderClientJobs();
      await renderClientContracts();
    } else {
      await renderEscrowConsole();
    }
  }

  // Calculate and Render Dashboard Stats
  async function renderStats() {
    let activeContracts = await db.getContracts(currentRole);
    let allContracts = await db.getContracts(currentRole);
    
    let activeCount = activeContracts.filter(c => c.status === 'active').length;
    let completedCount = allContracts.filter(c => c.status === 'completed').length;
    
    let money = 0;
    let proposalsCount = 0;
    
    if (currentRole === 'freelancer') {
      // Freelancer earnings: sum of budgets of completed contracts
      money = allContracts.filter(c => c.status === 'completed').reduce((sum, c) => sum + c.budget, 0);
      document.getElementById('label-stat-money').textContent = 'Total Earnings';
      
      // Proposals sent by logged in Freelancer
      let proposals = await db.getProposals(null, currentUser ? currentUser.id : 1);
      proposalsCount = proposals.length;
      document.getElementById('label-stat-proposals').textContent = 'Active Bids';
    } else {
      // Client spend: sum of budgets of all active/completed contracts
      money = allContracts.reduce((sum, c) => sum + c.budget, 0);
      document.getElementById('label-stat-money').textContent = 'Total Spend';
      
      // Proposals received for all client's jobs
      let jobs = await db.getJobs();
      let proposals = await db.getProposals();
      let jobIds = jobs.map(j => j.id);
      proposalsCount = proposals.filter(p => jobIds.includes(p.job_id)).length;
      document.getElementById('label-stat-proposals').textContent = 'Bids Received';
    }
    
    document.getElementById('stat-active-gigs').textContent = activeCount;
    document.getElementById('stat-earnings').textContent = '₦' + money.toLocaleString();
    document.getElementById('stat-proposals').textContent = proposalsCount;
    document.getElementById('stat-completed').textContent = completedCount;
  }

  // Render Job Board for Freelancers
  async function renderJobsList() {
    const listBody = document.getElementById('jobs-list');
    if (!listBody) return;
    
    // Pulse Skeleton Loader while fetching
    listBody.innerHTML = `
      <div class="skeleton-card">
        <div class="skeleton-title skeleton-pulse"></div>
        <div class="skeleton-meta skeleton-pulse"></div>
        <div class="skeleton-text skeleton-pulse"></div>
        <div class="skeleton-text skeleton-pulse"></div>
        <div class="skeleton-text skeleton-text--short skeleton-pulse"></div>
      </div>
      <div class="skeleton-card">
        <div class="skeleton-title skeleton-pulse"></div>
        <div class="skeleton-meta skeleton-pulse"></div>
        <div class="skeleton-text skeleton-pulse"></div>
        <div class="skeleton-text skeleton-pulse"></div>
        <div class="skeleton-text skeleton-text--short skeleton-pulse"></div>
      </div>
    `;
    
    let category = document.getElementById('category-filter').value;
    let query = document.getElementById('search-input').value;
    
    let jobs = await db.getJobs(category, query);
    listBody.innerHTML = '';
    
    if (jobs.length === 0) {
      listBody.innerHTML = '<div class="glass-card text-center" style="padding: var(--sp-xl); color: var(--clr-text-muted);">No open jobs match your criteria. Try searching other categories.</div>';
      return;
    }
    
    jobs.forEach(job => {
      let skillsHtml = job.skills.split(',').map(s => `<span class="skill-tag">${s.trim()}</span>`).join('');
      let dateFormatted = job.created_at.split(' ')[0];
      
      let card = document.createElement('div');
      card.className = 'job-card';
      card.innerHTML = `
        <div class="job-card-header">
          <h3 class="job-card-title">${job.title}</h3>
          <span class="budget-tag">₦${job.budget.toLocaleString()}</span>
        </div>
        <div class="job-meta-row">
          <span>📁 ${job.category}</span>
          <span>📅 Posted: ${dateFormatted}</span>
          <span>⏳ Deadline: ${job.deadline}</span>
          <span class="status-badge status-badge--${job.status}">${job.status}</span>
        </div>
        <p class="job-card-body">${job.description}</p>
        <div class="job-card-footer">
          <div class="skills-tags">${skillsHtml}</div>
          <span style="font-size: var(--fs-small); font-weight: 600; color: var(--magenta);">View Project Details &rarr;</span>
        </div>
      `;
      
      card.addEventListener('click', () => openJobDetails(job.id));
      listBody.appendChild(card);
    });
  }

  // Render Proposals Table for Freelancers
  async function renderProposalsTable() {
    const tbody = document.getElementById('proposals-list-body');
    if (!tbody) return;
    
    let proposals = await db.getProposals(null, currentUser ? currentUser.id : 1);
    tbody.innerHTML = '';
    
    if (proposals.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--clr-text-muted);">You have not submitted any bids yet.</td></tr>';
      return;
    }
    
    for (let p of proposals) {
      let job = await db.getJob(p.job_id);
      let jobTitle = job ? job.title : `Project #${p.job_id}`;
      let date = p.created_at.split(' ')[0];
      let row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${jobTitle}</strong></td>
        <td>₦${p.bid_amount.toLocaleString()}</td>
        <td>${p.delivery_time}</td>
        <td>${date}</td>
        <td><span class="status-badge status-badge--${p.status}">${p.status}</span></td>
      `;
      tbody.appendChild(row);
    }
  }

  // Render Hired Gigs for Freelancers
  async function renderFreelancerContracts() {
    const list = document.getElementById('freelancer-contracts-list');
    if (!list) return;
    
    let contracts = await db.getContracts('freelancer');
    list.innerHTML = '';
    
    if (contracts.length === 0) {
      list.innerHTML = '<div class="glass-card text-center" style="padding: var(--sp-xl); color: var(--clr-text-muted);">You have no active or historical contracts as a freelancer.</div>';
      return;
    }
    
    for (let c of contracts) {
      let job = await db.getJob(c.job_id);
      let jobTitle = job ? job.title : `Project #${c.job_id}`;
      
      let card = document.createElement('div');
      card.className = 'contract-card';
      card.innerHTML = `
        <div class="contract-info">
          <h3>${jobTitle}</h3>
          <div class="contract-meta">
            <span>👤 Client: ${c.client_name}</span>
            <span>💰 Budget: ₦${c.budget.toLocaleString()}</span>
            <span>⏳ Deadline: ${c.deadline}</span>
            <span class="status-badge status-badge--${c.status}">${c.status}</span>
          </div>
        </div>
        <div class="contract-actions">
          <button class="btn btn--primary btn--sm btn-open-workspace" data-id="${c.id}">Open Workspace</button>
        </div>
      `;
      
      card.querySelector('.btn-open-workspace').addEventListener('click', () => openWorkspace(c));
      list.appendChild(card);
    }
  }

  // Populate profile edit form
  async function populateProfileForm() {
    let profile = await db.getProfile();
    document.getElementById('profile-name').value = profile.name;
    document.getElementById('profile-title').value = profile.title;
    document.getElementById('profile-rate').value = profile.rate;
    document.getElementById('profile-portfolio').value = profile.portfolio_url || '';
    document.getElementById('profile-skills').value = profile.skills;
    document.getElementById('profile-bio').value = profile.bio;
  }

  // Render client posted jobs list
  async function renderClientJobs() {
    const listBody = document.getElementById('client-jobs-list');
    if (!listBody) return;
    
    // Pulse Skeleton Loader while fetching
    listBody.innerHTML = `
      <div class="skeleton-card">
        <div class="skeleton-title skeleton-pulse"></div>
        <div class="skeleton-meta skeleton-pulse"></div>
        <div class="skeleton-text skeleton-pulse"></div>
      </div>
      <div class="skeleton-card">
        <div class="skeleton-title skeleton-pulse"></div>
        <div class="skeleton-meta skeleton-pulse"></div>
        <div class="skeleton-text skeleton-pulse"></div>
      </div>
    `;
    
    let jobs = await db.getJobs();
    listBody.innerHTML = '';
    
    if (jobs.length === 0) {
      listBody.innerHTML = '<div class="glass-card text-center" style="padding: var(--sp-xl); color: var(--clr-text-muted);">You have not posted any projects. Click "Post a Project" to start hiring.</div>';
      return;
    }
    
    for (let job of jobs) {
      let proposals = await db.getProposals(job.id);
      let activeBids = proposals.length;
      let date = job.created_at.split(' ')[0];
      
      let card = document.createElement('div');
      card.className = 'job-card';
      card.innerHTML = `
        <div class="job-card-header">
          <h3 class="job-card-title">${job.title}</h3>
          <span class="budget-tag">₦${job.budget.toLocaleString()}</span>
        </div>
        <div class="job-meta-row">
          <span>📁 ${job.category}</span>
          <span>📅 Posted: ${date}</span>
          <span>⏳ Deadline: ${job.deadline}</span>
          <span class="status-badge status-badge--${job.status}">${job.status}</span>
        </div>
        <p class="job-card-body">${job.description}</p>
        <div class="job-card-footer">
          <span style="font-size: var(--fs-small); font-weight: var(--fw-semibold); color: var(--clr-text-muted);">Bids Received: <strong style="color: var(--clr-text-primary); font-size: 1.05rem;">${activeBids}</strong></span>
          <span style="font-size: var(--fs-small); font-weight: 600; color: var(--magenta);">Review Proposals &rarr;</span>
        </div>
      `;
      
      card.addEventListener('click', () => openJobDetails(job.id));
      listBody.appendChild(card);
    }
  }

  // Render Client active contracts list
  async function renderClientContracts() {
    const list = document.getElementById('client-contracts-list');
    if (!list) return;
    
    let contracts = await db.getContracts('client');
    list.innerHTML = '';
    
    if (contracts.length === 0) {
      list.innerHTML = '<div class="glass-card text-center" style="padding: var(--sp-xl); color: var(--clr-text-muted);">No active hired contracts right now. Review freelancer proposals on your job posts to hire.</div>';
      return;
    }
    
    for (let c of contracts) {
      let job = await db.getJob(c.job_id);
      let jobTitle = job ? job.title : `Project #${c.job_id}`;
      
      let card = document.createElement('div');
      card.className = 'contract-card';
      card.innerHTML = `
        <div class="contract-info">
          <h3>${jobTitle}</h3>
          <div class="contract-meta">
            <span>👤 Freelancer: ${c.freelancer_name}</span>
            <span>💰 Budget: ₦${c.budget.toLocaleString()}</span>
            <span>⏳ Deadline: ${c.deadline}</span>
            <span class="status-badge status-badge--${c.status}">${c.status}</span>
          </div>
        </div>
        <div class="contract-actions">
          <button class="btn btn--primary btn--sm btn-open-workspace" data-id="${c.id}">Open Workspace</button>
        </div>
      `;
      
      card.querySelector('.btn-open-workspace').addEventListener('click', () => openWorkspace(c));
      list.appendChild(card);
    }
  }

  // --- Modal Job Details & Proposals Handler ---
  async function openJobDetails(jobId) {
    const modal = document.getElementById('job-detail-modal');
    const body = document.getElementById('job-modal-body');
    
    let job = await db.getJob(jobId);
    let proposals = await db.getProposals(jobId);
    
    let date = job.created_at.split(' ')[0];
    let skillsHtml = job.skills.split(',').map(s => `<span class="skill-tag">${s.trim()}</span>`).join('');
    
    body.innerHTML = `
      <div class="detail-header" style="margin-bottom: var(--sp-lg); border-bottom: 1px solid var(--clr-border); padding-bottom: var(--sp-md);">
        <span class="status-badge status-badge--${job.status}" style="margin-bottom: var(--sp-sm); display: inline-block;">${job.status}</span>
        <h2>${job.title}</h2>
        <div class="job-meta-row" style="margin-top: 4px; margin-bottom: 0;">
          <span>📁 ${job.category}</span>
          <span>📅 Posted: ${date}</span>
          <span>⏳ Deadline: ${job.deadline}</span>
          <span>👤 Client: ${job.client_name}</span>
        </div>
      </div>
      
      <div style="margin-bottom: var(--sp-xl);">
        <h3>Project Description</h3>
        <p class="text-muted" style="font-size: var(--fs-small); line-height: var(--lh-body); margin-top: 4px;">${job.description}</p>
        <h4 style="margin-top: var(--sp-md); margin-bottom: var(--sp-sm);">Skills Required</h4>
        <div class="skills-tags">${skillsHtml}</div>
      </div>
      
      <div style="margin-bottom: var(--sp-xl); padding: var(--sp-md) var(--sp-lg); background: rgba(16, 185, 129, 0.04); border: 1px solid rgba(16, 185, 129, 0.15); border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="font-size: var(--fs-xs); color: var(--clr-text-muted); text-transform: uppercase;">Budget</span>
          <h3 style="color: var(--clr-success); margin: 0; font-size: 1.8rem;">₦${job.budget.toLocaleString()}</h3>
        </div>
      </div>
    `;

    // Flow separation based on workspace role
    if (currentRole === 'freelancer') {
      // FREELANCER VIEW: Submit bid
      let profile = await db.getProfile();
      let myBid = proposals.find(p => p.freelancer_id === profile.id);
      
      if (myBid) {
        body.innerHTML += `
          <div class="glass-card" style="border-left: 3px solid var(--magenta); padding: var(--sp-md) var(--sp-lg);">
            <h4>Your Submitted Proposal</h4>
            <div class="job-meta-row" style="margin-top: 6px; margin-bottom: var(--sp-sm);">
              <span>Bid: <strong>₦${myBid.bid_amount.toLocaleString()}</strong></span>
              <span>Delivery: <strong>${myBid.delivery_time}</strong></span>
              <span>Status: <strong class="text-accent">${myBid.status}</strong></span>
            </div>
            <p style="font-size: var(--fs-small); color: var(--clr-text-secondary); font-style: italic;">"${myBid.cover_letter}"</p>
          </div>
        `;
      } else if (job.status === 'open') {
        body.innerHTML += `
          <div class="proposal-form-section" style="border-top: 1px solid var(--clr-border); padding-top: var(--sp-lg);">
            <h3>Submit a Proposal for this Project</h3>
            <form id="proposal-submit-form" style="margin-top: var(--sp-md); display: flex; flex-direction: column; gap: var(--sp-md);">
              <input type="hidden" id="prop-job-id" value="${job.id}" />
              <div class="grid grid-2">
                <div class="form-group">
                  <label class="form-label" for="prop-amount">Bid Amount (₦)</label>
                  <input type="number" id="prop-amount" class="form-input" value="${job.budget}" required />
                </div>
                <div class="form-group">
                  <label class="form-label" for="prop-time">Delivery Time</label>
                  <input type="text" id="prop-time" class="form-input" placeholder="e.g. 5 Days" required />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label" for="prop-letter">Cover Letter & Strategy Pitch</label>
                <textarea id="prop-letter" class="form-input form-textarea" placeholder="Explain why you are qualified, what tools you will use, and your timeline..." required></textarea>
              </div>
              <button type="submit" class="btn btn--primary btn--lg" style="align-self: flex-start;">
                Submit Proposal
              </button>
            </form>
          </div>
        `;
        
        setTimeout(() => {
          document.getElementById('proposal-submit-form').addEventListener('submit', handleProposalSubmit);
        }, 50);
      } else {
        body.innerHTML += `
          <div class="glass-card text-center" style="padding: var(--sp-md); color: var(--clr-text-muted);">
            🔒 Bids are closed for this project. Status: ${job.status}.
          </div>
        `;
      }
    } else {
      // CLIENT VIEW: Review candidates
      body.innerHTML += `
        <div class="proposals-review-section" style="border-top: 1px solid var(--clr-border); padding-top: var(--sp-lg);">
          <h3 style="margin-bottom: var(--sp-md);">Freelancer Bids (${proposals.length})</h3>
      `;
      
      if (proposals.length === 0) {
        body.innerHTML += `<p class="text-muted" style="font-size: var(--fs-small);">No proposals submitted yet. Active proposals will appear here as freelancers bid.</p>`;
      } else {
        proposals.forEach(p => {
          let ratingStars = '⭐'.repeat(Math.round(4.8)) + ' (4.8)'; // simple mock star
          let isHired = p.status === 'hired';
          let hireBtn = '';
          
          if (job.status === 'open') {
            hireBtn = `<button class="btn btn--primary btn--sm btn-hire-candidate" data-id="${p.id}">Hire Freelancer</button>`;
          } else if (isHired) {
            hireBtn = `<span class="status-badge status-badge--contracted" style="font-size: var(--fs-xs);">Hired Professional</span>`;
          }
          
          body.innerHTML += `
            <div class="proposal-card-row">
              <div class="flex-between" style="margin-bottom: var(--sp-sm);">
                <div>
                  <h4 style="margin: 0; color: var(--clr-text-primary); font-size: var(--fs-h4);">${p.freelancer_name}</h4>
                  <span style="font-size: var(--fs-xs); color: var(--clr-text-muted);">${p.freelancer_title} &middot; ${ratingStars}</span>
                </div>
                <div style="text-align: right;">
                  <strong style="color: var(--clr-success); display: block; font-size: var(--fs-h4);">₦${p.bid_amount.toLocaleString()}</strong>
                  <span style="font-size: var(--fs-xs); color: var(--clr-text-muted);">Time: ${p.delivery_time}</span>
                </div>
              </div>
              <p class="text-muted" style="font-size: var(--fs-small); line-height: 1.45; margin-bottom: var(--sp-md); font-style: italic;">"${p.cover_letter}"</p>
              <div class="flex-between" style="border-top: 1px dashed var(--clr-border); padding-top: var(--sp-sm);">
                <span class="status-badge status-badge--${p.status}">${p.status}</span>
                ${hireBtn}
              </div>
            </div>
          `;
        });
      }
      
      body.innerHTML += `</div>`;
      
      setTimeout(() => {
        document.querySelectorAll('.btn-hire-candidate').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            let id = parseInt(e.target.getAttribute('data-id'));
            let prop = proposals.find(p => p.id === id);
            if (!prop) return;
            
            document.getElementById('escrow-payment-amount').textContent = '₦' + prop.bid_amount.toLocaleString();
            document.getElementById('escrow-payment-prop-id').value = id;
            document.getElementById('escrow-payment-ref').value = '';
            
            closeModal();
            document.getElementById('escrow-payment-modal').classList.add('open');
          });
        });
      }, 50);
    }
    
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  // Submit proposal handler
  async function handleProposalSubmit(e) {
    e.preventDefault();
    let jobId = document.getElementById('prop-job-id').value;
    let amount = document.getElementById('prop-amount').value;
    let time = document.getElementById('prop-time').value;
    let letter = document.getElementById('prop-letter').value;
    
    let submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Submitting Bid...';
    submitBtn.disabled = true;
    
    let res = await db.submitProposal({
      job_id: jobId,
      bid_amount: amount,
      delivery_time: time,
      cover_letter: letter
    });
    
    if (res) {
      window.showToast("Proposal bid submitted successfully!", "success");
      closeModal();
      await refreshAllViews();
    }
  }

  function closeModal() {
    document.getElementById('job-detail-modal').classList.remove('open');
    document.body.style.overflow = '';
  }

  async function renderEscrowConsole() {
    const tbody = document.getElementById('escrow-disputes-list-body');
    if (!tbody) return;

    let disputes = await db.getDisputes();
    tbody.innerHTML = '';

    if (disputes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--clr-text-muted);">No dispute claims filed yet.</td></tr>';
      return;
    }

    disputes.forEach(d => {
      let row = document.createElement('tr');
      let statusClass = d.status === 'resolved' ? 'status-badge--completed' : (d.status === 'responded' ? 'status-badge--contracted' : 'status-badge--open');
      
      let actionBtn = '';
      if (d.status !== 'resolved') {
        actionBtn = `<button class="btn btn--outline btn--sm btn-resolve-dispute-trigger" data-contract-id="${d.contract_id}">Mediate</button>`;
      } else {
        actionBtn = `<span class="text-muted" style="font-size: var(--fs-xs);">Resolved (${d.resolution_type})</span>`;
      }

      row.innerHTML = `
        <td><strong>${escapeHtml(d.job_title)}</strong></td>
        <td>${escapeHtml(d.freelancer_name)}</td>
        <td>${escapeHtml(d.client_name)}</td>
        <td>₦${d.budget.toLocaleString()}</td>
        <td>${d.created_at.split(' ')[0]}</td>
        <td><span class="status-badge ${statusClass}">${d.status}</span></td>
        <td>${actionBtn}</td>
      `;

      if (d.status !== 'resolved') {
        row.querySelector('.btn-resolve-dispute-trigger').addEventListener('click', () => {
          document.getElementById('dispute-resolution-contract-id').value = d.contract_id;
          document.getElementById('res-freelancer-claim').textContent = d.reason;
          document.getElementById('res-client-response').textContent = d.client_response || '(No response submitted yet)';
          document.getElementById('dispute-resolution-notes').value = '';
          document.getElementById('dispute-resolution-modal').classList.add('open');
        });
      }

      tbody.appendChild(row);
    });
  }

  async function renderMilestones(contract) {
    const listContainer = document.getElementById('milestones-list-container');
    if (!listContainer) return;

    let milestones = [];
    if (apiMode) {
      try {
        let res = await fetch(`${API_BASE}/contracts/${contract.id}/milestones`);
        if (res.ok) milestones = await res.json();
      } catch (e) {
        console.error('Milestones fetch failed:', e);
      }
    } else {
      let allMilestones = JSON.parse(storage.getItem('m_milestones')) || [];
      milestones = allMilestones.filter(m => m.contract_id === contract.id);
      if (milestones.length === 0) {
        let defaultM = {
          id: allMilestones.length ? Math.max(...allMilestones.map(m => m.id)) + 1 : 1,
          contract_id: contract.id,
          title: 'Project Milestone (Full Budget)',
          amount: contract.budget,
          status: contract.status === 'completed' ? 'released' : 'funded',
          created_at: contract.created_at
        };
        allMilestones.push(defaultM);
        storage.setItem('m_milestones', JSON.stringify(allMilestones));
        milestones = [defaultM];
      }
    }

    let totalBudget = contract.budget;
    let releasedAmount = milestones.filter(m => m.status === 'released').reduce((sum, m) => sum + m.amount, 0);
    let lockedAmount = milestones.filter(m => m.status === 'funded' || m.status === 'requested').reduce((sum, m) => sum + m.amount, 0);

    document.getElementById('escrow-total-budget').textContent = '₦' + totalBudget.toLocaleString();
    document.getElementById('escrow-released-amount').textContent = '₦' + releasedAmount.toLocaleString();
    document.getElementById('escrow-locked-amount').textContent = '₦' + lockedAmount.toLocaleString();

    listContainer.innerHTML = '';
    milestones.forEach(m => {
      let card = document.createElement('div');
      card.className = `milestone-card status-${m.status}`;
      
      let actionBtn = '';
      if (contract.status !== 'completed' && contract.status !== 'disputed') {
        if (m.status === 'funded' && currentRole === 'freelancer') {
          actionBtn = `<button class="btn btn--outline btn--xs btn-request-milestone" data-id="${m.id}" style="padding: 2px 6px; font-size: 0.65rem; min-height: auto;">Request Release</button>`;
        } else if ((m.status === 'funded' || m.status === 'requested') && currentRole === 'client') {
          actionBtn = `<button class="btn btn--primary btn--xs btn-release-milestone" data-id="${m.id}" style="padding: 2px 6px; font-size: 0.65rem; min-height: auto;">Release Funds</button>`;
        }
      }

      card.innerHTML = `
        <div class="milestone-header">
          <span class="milestone-title">${escapeHtml(m.title)}</span>
          <span class="milestone-amount">₦${m.amount.toLocaleString()}</span>
        </div>
        <div class="milestone-meta">
          <span class="milestone-status ${m.status}">${m.status.toUpperCase()}</span>
          ${actionBtn}
        </div>
      `;

      if (m.status === 'funded' && currentRole === 'freelancer') {
        card.querySelector('.btn-request-milestone').addEventListener('click', async (e) => {
          e.target.disabled = true;
          e.target.textContent = 'Requesting...';
          let success = await db.requestMilestone(contract.id, m.id);
          if (success) {
            await renderMilestones(contract);
            await renderChatFeed(contract.id);
          }
        });
      } else if ((m.status === 'funded' || m.status === 'requested') && currentRole === 'client') {
        card.querySelector('.btn-release-milestone').addEventListener('click', async (e) => {
          e.target.disabled = true;
          e.target.textContent = 'Releasing...';
          let success = await db.releaseMilestone(contract.id, m.id);
          if (success) {
            await renderMilestones(contract);
            await renderChatFeed(contract.id);
          }
        });
      }

      listContainer.appendChild(card);
    });

    // Dispute actions in escrow sidebar
    if (contract.status === 'active' && currentRole === 'freelancer') {
      let disputeDiv = document.createElement('div');
      disputeDiv.style.cssText = 'margin-top: var(--sp-lg); border-top: 1px solid var(--clr-border); padding-top: var(--sp-md);';
      disputeDiv.innerHTML = `<button class="btn btn--outline btn--sm btn--danger" id="btn-file-dispute-trigger" style="width: 100%; border-color: rgba(239, 68, 68, 0.4); color: var(--clr-danger); font-size: 0.75rem;">⚠️ Dispute Project Payment</button>`;
      disputeDiv.querySelector('#btn-file-dispute-trigger').addEventListener('click', () => {
        document.getElementById('dispute-contract-id').value = contract.id;
        document.getElementById('dispute-reason').value = '';
        document.getElementById('dispute-filing-modal').classList.add('open');
      });
      listContainer.appendChild(disputeDiv);
    } else if (contract.status === 'disputed') {
      let disputeDiv = document.createElement('div');
      disputeDiv.style.cssText = 'margin-top: var(--sp-lg); display: flex; flex-direction: column; gap: 8px;';
      disputeDiv.innerHTML = `
        <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); padding: var(--sp-md); border-radius: var(--radius-sm); font-size: var(--fs-xs); color: var(--clr-text-secondary); line-height: 1.45;">
          ⚠️ <strong>Project is Disputed:</strong> Escrow payout is frozen. Nexus Escrow Agent is reviewing the mediation ticket.
        </div>
      `;

      if (currentRole === 'client') {
        let disputes = await db.getDisputes();
        let dispute = disputes.find(d => d.contract_id === contract.id);
        if (dispute && dispute.status === 'open') {
          let btn = document.createElement('button');
          btn.className = 'btn btn--primary btn--sm';
          btn.id = 'btn-respond-dispute-trigger';
          btn.style.cssText = 'width: 100%; font-size: 0.75rem;';
          btn.textContent = 'Respond to Dispute Claim';
          btn.addEventListener('click', () => {
            document.getElementById('dispute-response-contract-id').value = contract.id;
            document.getElementById('dispute-reporter-reason').textContent = dispute.reason;
            document.getElementById('dispute-response-text').value = '';
            document.getElementById('dispute-response-modal').classList.add('open');
          });
          disputeDiv.appendChild(btn);
        }
      }
      listContainer.appendChild(disputeDiv);
    }
  }

  // --- Active Chat / Project Workspace Handler ---
  async function openWorkspace(contract) {
    // Hide stats and tabs nav to focus on the workspace chat
    document.getElementById('stats-container').style.display = 'none';
    document.querySelector('.workspace-wrapper').style.display = 'none';
    
    let chatPanel = document.getElementById('chat-workspace-section');
    chatPanel.style.display = 'block';
    
    activeChatContractId = contract.id;
    
    // Set Header titles
    let job = await db.getJob(contract.job_id);
    let jobTitle = job ? job.title : `Project Workspace`;
    document.getElementById('chat-project-title').textContent = jobTitle;
    document.getElementById('chat-parties').textContent = `Client: ${contract.client_name} | Freelancer: ${contract.freelancer_name} (Budget: ₦${contract.budget.toLocaleString()})`;
    
    await renderChatFeed(contract.id);
    await renderWorkflowActions(contract);
    await renderMilestones(contract);
    
    // Setup 3s polling for messages to simulate responses and keep feed current
    if (chatPollInterval) clearInterval(chatPollInterval);
    chatPollInterval = setInterval(() => {
      if (activeChatContractId === contract.id) {
        renderChatFeed(contract.id);
      }
    }, 3000);
    
    chatPanel.scrollIntoView({ behavior: 'smooth' });
  }

  function closeWorkspace() {
    if (chatPollInterval) clearInterval(chatPollInterval);
    activeChatContractId = null;
    document.getElementById('chat-workspace-section').style.display = 'none';
    document.getElementById('stats-container').style.display = 'grid';
    document.querySelector('.workspace-wrapper').style.display = 'block';
    refreshAllViews();
  }

  async function renderChatFeed(contractId) {
    const feedBox = document.getElementById('chat-feed-box');
    if (!feedBox) return;
    
    let messages = await db.getMessages(contractId);
    // Track scroll height to auto scroll only if near bottom
    let isNearBottom = feedBox.scrollHeight - feedBox.scrollTop - feedBox.clientHeight < 120;
    
    feedBox.innerHTML = '';
    
    if (messages.length === 0) {
      feedBox.innerHTML = '<div class="message-bubble--system">Chat workspace created. Discuss requirements or submit work outputs.</div>';
      return;
    }
    
    messages.forEach(m => {
      let bubble = document.createElement('div');
      
      if (m.sender === 'client' && m.text.includes('Project completed!')) {
        bubble.className = 'message-bubble--system';
        bubble.innerHTML = `🏁 <strong>${m.text}</strong>`;
      } else {
        let isClient = m.sender === 'client';
        bubble.className = `message-bubble ${isClient ? 'message-bubble--client' : 'message-bubble--freelancer'}`;
        
        let fileSubmissionHtml = '';
        if (m.is_work_submission && m.submission_file_url) {
          fileSubmissionHtml = `
            <div class="work-submission-card">
              📁 <strong>WORK SUBMISSION DELIVERABLE</strong><br/>
              Link: <a href="${m.submission_file_url}" target="_blank" style="color: var(--magenta-light); text-decoration: underline;">${m.submission_file_url}</a>
            </div>
          `;
        }
        
        bubble.innerHTML = `
          <strong>${isClient ? 'Client' : 'Freelancer'}:</strong>
          <p style="margin-top: 4px; white-space: pre-wrap;">${m.text}</p>
          ${fileSubmissionHtml}
          <span class="message-timestamp">${m.timestamp}</span>
        `;
      }
      feedBox.appendChild(bubble);
    });
    
    if (isNearBottom || feedBox.scrollTop === 0) {
      feedBox.scrollTop = feedBox.scrollHeight;
    }
  }

  async function renderWorkflowActions(contract) {
    const container = document.getElementById('chat-workflow-actions');
    container.innerHTML = '';
    
    if (contract.status === 'completed') {
      container.innerHTML = `<div class="glass-card text-center" style="color: var(--clr-success); padding: var(--sp-md); font-weight: 700; border-color: rgba(16, 185, 129, 0.2);">🔒 Contract Closed. Project deliverables have been fully released and paid.</div>`;
      document.getElementById('chat-input-form').style.display = 'none';
      return;
    }
    
    document.getElementById('chat-input-form').style.display = 'flex';
    
    if (currentRole === 'freelancer') {
      // FREELANCER ACTIONS: Submit work
      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: var(--sp-sm);">
          <h4 style="margin: 0;">Submit Final Project Deliverables</h4>
          <p class="text-muted" style="font-size: var(--fs-xs);">Provide work link (e.g. Google Drive, GitHub) and a cover note to request milestone release.</p>
          <form id="submission-form" style="display: flex; gap: var(--sp-md); flex-wrap: wrap;">
            <input type="url" id="submit-file-url" class="form-input" style="flex: 1; min-width: 240px; font-size: var(--fs-xs);" placeholder="Deliverable URL (https://...)" required />
            <input type="text" id="submit-notes" class="form-input" style="flex: 1.5; min-width: 240px; font-size: var(--fs-xs);" placeholder="Submission notes/descriptions..." required />
            <button type="submit" class="btn btn--primary btn--sm">Submit Project Work</button>
          </form>
        </div>
      `;
      
      setTimeout(() => {
        document.getElementById('submission-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          let fileUrl = document.getElementById('submit-file-url').value;
          let note = document.getElementById('submit-notes').value;
          
          let btn = e.target.querySelector('button[type="submit"]');
          btn.textContent = 'Submitting...';
          btn.disabled = true;
          
          await db.sendMessage(contract.id, {
            sender: 'freelancer',
            text: `[Submission Note] ${note}`,
            is_work_submission: 1,
            submission_file_url: fileUrl
          });
          
          await renderChatFeed(contract.id);
          await renderWorkflowActions(contract);
        });
      }, 50);
    } else {
      // CLIENT ACTIONS: Complete contract
      // Retrieve messages to check if freelancer submitted work
      let messages = await db.getMessages(contract.id);
      let submissions = messages.filter(m => m.is_work_submission);
      
      let submissionStatusHtml = '<p class="text-muted" style="font-size: var(--fs-xs); margin: 0;">Waiting for freelancer to submit final work deliverables.</p>';
      let actionBtnDisabled = 'disabled';
      
      if (submissions.length > 0) {
        let lastSub = submissions[submissions.length - 1];
        submissionStatusHtml = `
          <div style="font-size: var(--fs-xs);">
            🟢 <strong>Vetted Work Ready for Review:</strong> <a href="${lastSub.submission_file_url}" target="_blank" style="color: var(--magenta-light); text-decoration: underline;">${lastSub.submission_file_url}</a>
            <p class="text-muted" style="margin-top: 2px;">Notes: "${lastSub.text.replace('[Submission Note] ', '')}"</p>
          </div>
        `;
        actionBtnDisabled = '';
      }
      
      container.innerHTML = `
        <div class="flex-between" style="flex-wrap: wrap; gap: var(--sp-md);">
          <div>
            <h4 style="margin: 0;">Approve Work & Release Payment</h4>
            ${submissionStatusHtml}
          </div>
          <button class="btn btn--primary btn--sm" id="btn-complete-project" ${actionBtnDisabled}>Release Funds (₦${contract.budget.toLocaleString()})</button>
        </div>
      `;
      
      if (submissions.length > 0) {
        setTimeout(() => {
          document.getElementById('btn-complete-project').addEventListener('click', async (e) => {
            e.target.textContent = 'Releasing...';
            e.target.disabled = true;
            
            await db.completeContract(contract.id);
            contract.status = 'completed'; // update local reference
            window.showToast("Milestone released! Contract completed successfully.", "success");
            await renderChatFeed(contract.id);
            await renderWorkflowActions(contract);
            await renderStats();
          });
        }, 50);
      }
    }
  }

  // Handle standard chat message send
  document.getElementById('chat-input-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const field = document.getElementById('chat-message-field');
    const text = field.value.trim();
    if (!text || !activeChatContractId) return;
    
    field.value = '';
    
    await db.sendMessage(activeChatContractId, {
      sender: currentRole === 'freelancer' ? 'freelancer' : 'client',
      text: text,
      is_work_submission: 0,
      submission_file_url: null
    });
    
    await renderChatFeed(activeChatContractId);
  });

  // --- Workspace Tabs Navigator ---
  document.querySelectorAll('.tab-trigger').forEach(trigger => {
    trigger.addEventListener('click', function() {
      // Find parent navigation
      let nav = this.closest('.tabs-nav') || this.closest('.workspace-pane');
      let triggers = nav.querySelectorAll('.tab-trigger');
      
      // Deactivate all
      triggers.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      
      // Deactivate all panes
      let paneContainer = this.closest('.workspace-pane');
      let panes = paneContainer.querySelectorAll('.tab-pane');
      panes.forEach(p => p.classList.remove('active'));
      
      // Activate target
      let targetId = this.getAttribute('data-target');
      document.getElementById(targetId).classList.add('active');
    });
  });

  // --- Role Switcher Action ---
  document.getElementById('btn-freelancer-mode').addEventListener('click', function() {
    if (currentRole === 'freelancer') return;
    document.getElementById('btn-client-mode').classList.remove('active');
    document.getElementById('btn-escrow-mode').classList.remove('active');
    this.classList.add('active');
    
    document.getElementById('client-pane').classList.remove('active');
    document.getElementById('escrow-agent-pane').classList.remove('active');
    document.getElementById('freelancer-pane').classList.add('active');
    
    currentRole = 'freelancer';
    closeWorkspace();
    window.showToast("Logged out successfully.", "info");
  });

  document.getElementById('btn-client-mode').addEventListener('click', function() {
    if (currentRole === 'client') return;
    document.getElementById('btn-freelancer-mode').classList.remove('active');
    document.getElementById('btn-escrow-mode').classList.remove('active');
    this.classList.add('active');
    
    document.getElementById('freelancer-pane').classList.remove('active');
    document.getElementById('escrow-agent-pane').classList.remove('active');
    document.getElementById('client-pane').classList.add('active');
    
    currentRole = 'client';
    closeWorkspace();
    window.showToast("Logged out successfully.", "info");
  });

  document.getElementById('btn-escrow-mode').addEventListener('click', function() {
    if (currentRole === 'escrow') return;
    document.getElementById('btn-freelancer-mode').classList.remove('active');
    document.getElementById('btn-client-mode').classList.remove('active');
    this.classList.add('active');
    
    document.getElementById('freelancer-pane').classList.remove('active');
    document.getElementById('client-pane').classList.remove('active');
    document.getElementById('escrow-agent-pane').classList.add('active');
    
    currentRole = 'escrow';
    closeWorkspace();
    renderEscrowConsole();
  });

  // --- New Modals Form Handlers ---

  // Escrow Payment Bank Transfer form submit
  document.getElementById('escrow-payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let propId = parseInt(document.getElementById('escrow-payment-prop-id').value);
    let paymentRef = document.getElementById('escrow-payment-ref').value.trim();
    
    let btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Verifying Escrow Transfer...';
    btn.disabled = true;
    
    let contract = await db.hireProposal(propId, paymentRef);
    
    btn.textContent = 'I Have Made the Transfer';
    btn.disabled = false;
    
    if (contract) {
      window.showToast("Escrow funded! Project contract is now active.", "success");
      document.getElementById('escrow-payment-modal').classList.remove('open');
      await refreshAllViews();
      openWorkspace(contract);
    }
  });

  // Dispute Filing form submit
  document.getElementById('dispute-filing-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let contractId = parseInt(document.getElementById('dispute-contract-id').value);
    let reason = document.getElementById('dispute-reason').value.trim();
    
    let btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Filing Dispute...';
    btn.disabled = true;
    
    let res = await db.fileDispute(contractId, reason);
    
    btn.textContent = 'File Official Dispute';
    btn.disabled = false;
    
    if (res) {
      window.showToast("Dispute opened. Escrow funds locked pending mediation.", "error");
      document.getElementById('dispute-filing-modal').classList.remove('open');
      let contracts = await db.getContracts(currentRole);
      let contract = contracts.find(c => c.id === contractId);
      if (contract) {
        contract.status = 'disputed';
        await renderChatFeed(contractId);
        await renderWorkflowActions(contract);
        await renderMilestones(contract);
      }
      await refreshAllViews();
    }
  });

  // Dispute Response form submit
  document.getElementById('dispute-response-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let contractId = parseInt(document.getElementById('dispute-response-contract-id').value);
    let responseText = document.getElementById('dispute-response-text').value.trim();
    
    let btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Submitting Statement...';
    btn.disabled = true;
    
    let res = await db.respondDispute(contractId, responseText);
    
    btn.textContent = 'Submit Official Response';
    btn.disabled = false;
    
    if (res) {
      window.showToast("Dispute response statement submitted successfully.", "info");
      document.getElementById('dispute-response-modal').classList.remove('open');
      let contracts = await db.getContracts(currentRole);
      let contract = contracts.find(c => c.id === contractId);
      if (contract) {
        await renderChatFeed(contractId);
        await renderWorkflowActions(contract);
        await renderMilestones(contract);
      }
      await refreshAllViews();
    }
  });

  // Dispute Resolution form submit
  document.getElementById('dispute-resolution-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let contractId = parseInt(document.getElementById('dispute-resolution-contract-id').value);
    let decision = document.getElementById('dispute-resolution-decision').value;
    let notes = document.getElementById('dispute-resolution-notes').value.trim();
    
    let btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Finalizing Resolution...';
    btn.disabled = true;
    
    let res = await db.resolveDispute(contractId, decision, notes);
    
    btn.textContent = 'Finalize Resolution Decision';
    btn.disabled = false;
    
    if (res) {
      window.showToast("Dispute mediation resolved and closed.", "success");
      document.getElementById('dispute-resolution-modal').classList.remove('open');
      await refreshAllViews();
    }
  });

  // New Modals Close triggers
  document.getElementById('close-escrow-payment-modal').addEventListener('click', () => {
    document.getElementById('escrow-payment-modal').classList.remove('open');
  });
  document.getElementById('btn-close-escrow-payment').addEventListener('click', () => {
    document.getElementById('escrow-payment-modal').classList.remove('open');
  });

  document.getElementById('close-dispute-filing-modal').addEventListener('click', () => {
    document.getElementById('dispute-filing-modal').classList.remove('open');
  });
  document.getElementById('btn-close-dispute-filing').addEventListener('click', () => {
    document.getElementById('dispute-filing-modal').classList.remove('open');
  });

  document.getElementById('close-dispute-response-modal').addEventListener('click', () => {
    document.getElementById('dispute-response-modal').classList.remove('open');
  });
  document.getElementById('btn-close-dispute-response').addEventListener('click', () => {
    document.getElementById('dispute-response-modal').classList.remove('open');
  });

  document.getElementById('close-dispute-resolution-modal').addEventListener('click', () => {
    document.getElementById('dispute-resolution-modal').classList.remove('open');
  });
  document.getElementById('btn-close-dispute-resolution').addEventListener('click', () => {
    document.getElementById('dispute-resolution-modal').classList.remove('open');
  });

  // --- Form Handlers ---

  // Post Job form submit
  document.getElementById('post-job-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let title = document.getElementById('job-title').value;
    let category = document.getElementById('job-category').value;
    let budget = document.getElementById('job-budget').value;
    let deadline = document.getElementById('job-deadline').value;
    let client = document.getElementById('job-client').value;
    let skills = document.getElementById('job-skills').value;
    let description = document.getElementById('job-desc').value;
    
    let btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Publishing Project...';
    btn.disabled = true;
    
    let res = await db.postJob({
      title,
      category,
      budget: parseFloat(budget),
      deadline,
      client_name: client,
      skills,
      description
    });
    
    if (res) {
      window.showToast("Project job post published successfully!", "success");
      e.target.reset();
      btn.textContent = 'Publish Project Post';
      btn.disabled = false;
      
      // Switch back to listings tab
      let nav = document.getElementById('client-pane');
      nav.querySelector('.tab-trigger[data-target="client-my-jobs"]').click();
      
      await refreshAllViews();
    }
  });

  // Edit profile form submit
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let name = document.getElementById('profile-name').value;
    let title = document.getElementById('profile-title').value;
    let rate = document.getElementById('profile-rate').value;
    let portfolio = document.getElementById('profile-portfolio').value;
    let skills = document.getElementById('profile-skills').value;
    let bio = document.getElementById('profile-bio').value;
    
    let btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Saving Profile...';
    btn.disabled = true;
    
    let res = await db.updateProfile({
      id: 1,
      name,
      title,
      rate: parseFloat(rate),
      portfolio_url: portfolio,
      skills,
      bio
    });
    
    if (res) {
      btn.textContent = 'Save Profile';
      btn.disabled = false;
      
      window.showToast("Profile settings saved successfully!", "success");
      await refreshAllViews();
    }
  });

  // Filters listeners
  document.getElementById('category-filter').addEventListener('change', renderJobsList);
  document.getElementById('search-input').addEventListener('input', renderJobsList);

  // Close modals listeners
  document.getElementById('close-detail-modal').addEventListener('click', closeModal);
  document.getElementById('btn-close-detail').addEventListener('click', closeModal);
  document.getElementById('btn-close-chat').addEventListener('click', closeWorkspace);

  // --- Authentication Tab switching ---
  const publicLoginBtn = document.getElementById('btn-marketplace-login');
  const authCloseBtn = document.getElementById('btn-auth-close');

  if (publicLoginBtn) {
    publicLoginBtn.addEventListener('click', () => {
      if (!apiMode) {
        window.showToast("Private workspace login requires the production server to be online.", "info");
        return;
      }
      clearAuthError('login-form');
      openAuthOverlay();
    });
  }

  if (authCloseBtn) {
    authCloseBtn.addEventListener('click', closeAuthOverlay);
  }

  document.getElementById('tab-login-btn').addEventListener('click', () => {
    document.getElementById('tab-login-btn').classList.add('active');
    document.getElementById('tab-register-btn').classList.remove('active');
    document.getElementById('login-form').classList.add('active');
    document.getElementById('register-form').classList.remove('active');
  });

  document.getElementById('tab-register-btn').addEventListener('click', () => {
    document.getElementById('tab-register-btn').classList.add('active');
    document.getElementById('tab-login-btn').classList.remove('active');
    document.getElementById('register-form').classList.add('active');
    document.getElementById('login-form').classList.remove('active');
  });

  // --- Auth Forms Submission ---
  function showAuthError(formId, message) {
    const form = document.getElementById(formId);
    let errDiv = form.querySelector('.auth-error-msg');
    if (!errDiv) {
      errDiv = document.createElement('div');
      errDiv.className = 'auth-error-msg';
      errDiv.style.cssText = 'color: #ff4a5a; background: rgba(255, 74, 90, 0.08); border: 1px solid rgba(255, 74, 90, 0.2); padding: 10px; border-radius: 6px; font-size: 0.8rem; margin-bottom: 15px; text-align: center;';
      form.insertBefore(errDiv, form.firstChild);
    }
    errDiv.textContent = message;
  }

  function clearAuthError(formId) {
    const form = document.getElementById(formId);
    const errDiv = form.querySelector('.auth-error-msg');
    if (errDiv) errDiv.remove();
  }

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthError('login-form');
    let email = document.getElementById('login-email').value;
    let password = document.getElementById('login-password').value;
    let btn = e.target.querySelector('button[type="submit"]');
    let originalText = btn.textContent;
    btn.textContent = 'Signing In...';
    btn.disabled = true;

    let res = await handleLogin(email, password);
    btn.textContent = originalText;
    btn.disabled = false;

    if (!res.success) {
      showAuthError('login-form', res.error);
    }
  });

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthError('register-form');
    let name = document.getElementById('register-name').value;
    let email = document.getElementById('register-email').value;
    let password = document.getElementById('register-password').value;
    let role = document.getElementById('register-role').value;
    let btn = e.target.querySelector('button[type="submit"]');
    let originalText = btn.textContent;
    btn.textContent = 'Registering...';
    btn.disabled = true;

    let res = await handleRegister(name, email, password, role);
    btn.textContent = originalText;
    btn.disabled = false;

    if (!res.success) {
      showAuthError('register-form', res.error);
    }
  });

  // --- Logout Event ---
  document.getElementById('btn-logout').addEventListener('click', handleLogout);

  // --- Notifications Toggle & Actions ---
  const notifTrigger = document.getElementById('notif-trigger');
  const notifDropdown = document.getElementById('notif-dropdown');
  const markAllReadBtn = document.getElementById('btn-mark-all-read');

  notifTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!notifDropdown.contains(e.target) && e.target !== notifTrigger) {
      notifDropdown.classList.remove('open');
    }
  });

  markAllReadBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (apiMode) {
      try {
        await fetch(`${API_BASE}/notifications/mark-read`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({})
        });
      } catch (e) {
        console.error('Failed to mark all as read:', e);
      }
    } else {
      let allNotifs = JSON.parse(storage.getItem('m_notifications')) || [];
      allNotifs.forEach(n => {
        if (n.user_id === currentUser.id) n.is_read = 1;
      });
      storage.setItem('m_notifications', JSON.stringify(allNotifs));
    }
    await loadNotifications();
  });

  // --- Initialize Application ---
  checkApiConnection();
});
