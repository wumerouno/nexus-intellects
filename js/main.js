/* ============================================================
   NEXUS INTELLECTS — Main JavaScript
   Navigation, mobile menu, tabs, accordion, form, carousel,
   theme toggle
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

  /* ---------- Theme Toggle ---------- */
  const themeToggle = document.getElementById('theme-toggle');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

  function getStoredTheme() {
    return storage.getItem('nexus-theme');
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    storage.setItem('nexus-theme', theme);
  }

  // Initialise theme with an explicit state so theme-specific CSS always wins.
  const storedTheme = getStoredTheme();
  if (storedTheme) {
    setTheme(storedTheme);
  } else {
    setTheme(prefersDark.matches ? 'dark' : 'light');
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      setTheme(next);
    });
  }

  /* ---------- Navbar Scroll ---------- */
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    const onScroll = () => {
      navbar.classList.toggle('scrolled', window.scrollY > 60);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Active Nav Link ---------- */
  const navLinks = document.querySelectorAll('.navbar__link');
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  navLinks.forEach((link) => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  /* ---------- Mobile Menu ---------- */
  const toggle = document.querySelector('.navbar__toggle');
  const mobileMenu = document.querySelector('.navbar__links');

  if (toggle && mobileMenu) {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      mobileMenu.classList.toggle('open');
      document.body.style.overflow = mobileMenu.classList.contains('open')
        ? 'hidden'
        : '';
    });

    // Close on link click
    mobileMenu.querySelectorAll('.navbar__link').forEach((link) => {
      link.addEventListener('click', () => {
        toggle.classList.remove('active');
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
      });
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
        toggle.classList.remove('active');
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
  }

  /* ---------- Smooth Scroll for Anchor Links ---------- */
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* ---------- Tabs ---------- */
  const tabContainers = document.querySelectorAll('[data-tabs]');

  tabContainers.forEach((container) => {
    const buttons = container.querySelectorAll('.tab-btn');
    const panels = container.querySelectorAll('.tab-content');

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');

        buttons.forEach((b) => b.classList.remove('active'));
        panels.forEach((p) => p.classList.remove('active'));

        btn.classList.add('active');
        const panel = container.querySelector(`#${target}`);
        if (panel) panel.classList.add('active');
      });
    });
  });

  /* ---------- Accordion / FAQ ---------- */
  const accordions = document.querySelectorAll('.accordion');

  accordions.forEach((accordion) => {
    const items = accordion.querySelectorAll('.accordion__item');

    items.forEach((item) => {
      const trigger = item.querySelector('.accordion__trigger');
      const content = item.querySelector('.accordion__content');

      trigger.addEventListener('click', () => {
        const isOpen = item.classList.contains('active');

        // Close all items in this accordion
        items.forEach((i) => {
          i.classList.remove('active');
          const c = i.querySelector('.accordion__content');
          if (c) c.style.maxHeight = null;
        });

        // Toggle clicked item
        if (!isOpen) {
          item.classList.add('active');
          content.style.maxHeight = content.scrollHeight + 'px';
        }
      });
    });
  });

  /* ---------- Carousels ---------- */
  document.querySelectorAll('[data-carousel]').forEach((carousel) => {
    const slides = carousel.querySelectorAll('[data-carousel-slide]');
    const dots = carousel.querySelectorAll('[data-carousel-dot]');
    if (!slides.length) return;

    let currentIndex = 0;
    let autoplayTimer;

    function goToSlide(index) {
      if (index < 0) index = slides.length - 1;
      if (index >= slides.length) index = 0;
      currentIndex = index;

      slides.forEach((s) => s.classList.remove('active'));
      dots.forEach((d) => d.classList.remove('active'));

      slides[currentIndex].classList.add('active');
      dots.forEach((dot, i) => dot.setAttribute('aria-current', i === currentIndex ? 'true' : 'false'));
      if (dots[currentIndex]) dots[currentIndex].classList.add('active');
    }

    function startAutoplay() {
      if (slides.length < 2) return;
      stopAutoplay();
      autoplayTimer = setInterval(() => goToSlide(currentIndex + 1), 6000);
    }

    function stopAutoplay() {
      clearInterval(autoplayTimer);
    }

    const prevBtn = carousel.querySelector('[data-carousel-prev]');
    const nextBtn = carousel.querySelector('[data-carousel-next]');

    if (prevBtn) prevBtn.addEventListener('click', () => { stopAutoplay(); goToSlide(currentIndex - 1); startAutoplay(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { stopAutoplay(); goToSlide(currentIndex + 1); startAutoplay(); });

    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => { stopAutoplay(); goToSlide(i); startAutoplay(); });
    });

    carousel.addEventListener('mouseenter', stopAutoplay);
    carousel.addEventListener('mouseleave', startAutoplay);

    goToSlide(0);
    startAutoplay();
  });

  /* ---------- Contact Form ---------- */
  const contactForm = document.getElementById('contact-form');

  if (contactForm) {
    const serviceSelect = contactForm.querySelector('#service');
    let queryService = new URLSearchParams(window.location.search).get('service');
    if (queryService === 'academic') queryService = 'writelab';

    if (serviceSelect && queryService) {
      const matchingOption = Array.from(serviceSelect.options).find((option) => option.value === queryService);
      if (matchingOption) serviceSelect.value = queryService;
    }

    const serviceLabels = {
      writelab: 'Nexus WriteLab',
      academic: 'Nexus WriteLab',
      career: 'Career Development',
      business: 'Business Services',
      visa: 'Visa Documentation',
      skill: 'NextPrep Academy',
      nextprep: 'Future Builders Bootcamp',
      other: 'Other'
    };

    function getStoredLeadFallback() {
      try {
        return JSON.parse(storage.getItem('nexus-leads-fallback') || '[]');
      } catch (error) {
        return [];
      }
    }

    function saveLeadFallback(lead) {
      const leads = getStoredLeadFallback();
      leads.unshift({ ...lead, saved_at: new Date().toISOString(), storage: 'local' });
      storage.setItem('nexus-leads-fallback', JSON.stringify(leads.slice(0, 50)));
      return { saved: true, storage: 'local' };
    }

    async function saveLeadRecord(lead) {
      try {
        const response = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lead)
        });

        if (!response.ok) throw new Error('Lead API unavailable');
        return await response.json();
      } catch (error) {
        return saveLeadFallback(lead);
      }
    }

    function buildLeadRoutes(lead) {
      const serviceLabel = serviceLabels[lead.service] || 'General Inquiry';
      const subject = lead.service === 'business'
        ? `Business Inquiry from ${lead.name}`
        : `Contact Form Submission from ${lead.name}`;
      const body = [
        `Name: ${lead.name}`,
        `Email: ${lead.email}`,
        `Phone: ${lead.phone || 'Not provided'}`,
        `Service: ${serviceLabel}`,
        `Source: ${lead.source}`,
        '',
        'Message:',
        lead.message
      ].join('\n');
      const whatsappText = [
        `Hello Nexus Intellect, I just submitted a ${serviceLabel} inquiry.`,
        `Name: ${lead.name}`,
        `Email: ${lead.email}`,
        lead.phone ? `Phone: ${lead.phone}` : '',
        `Message: ${lead.message}`
      ].filter(Boolean).join('\n');

      return {
        mailto: `mailto:info@nexusintellects.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
        whatsapp: `https://wa.me/2348166917029?text=${encodeURIComponent(whatsappText)}`
      };
    }

    function showContactConfirmation(lead, savedResult, routes) {
      const confirmation = contactForm.querySelector('#contact-confirmation');
      if (!confirmation) return;

      const isBusiness = lead.service === 'business';
      const storageLabel = savedResult && savedResult.storage === 'server'
        ? 'Lead record saved.'
        : 'Lead record saved locally and ready to sync when the site backend is available.';

      confirmation.innerHTML = `
        <strong>${isBusiness ? 'Business inquiry received.' : 'Message ready to send.'}</strong>
        <p>${storageLabel} ${isBusiness ? 'We are opening WhatsApp and preparing an email to info@nexusintellects.com so the business team can respond quickly.' : 'Your email client is being prepared to send this message to info@nexusintellects.com.'}</p>
        <div class="form-confirmation__actions">
          <a class="btn btn--primary btn--sm" href="${routes.mailto}">Send Email</a>
          ${isBusiness ? `<a class="btn btn--outline btn--sm" href="${routes.whatsapp}" target="_blank" rel="noopener">Open WhatsApp</a>` : ''}
        </div>
      `;
      confirmation.classList.add('active');
    }

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      let isValid = true;

      // Clear previous errors
      contactForm.querySelectorAll('.form-group').forEach((g) => {
        g.classList.remove('error');
      });

      // Validate required fields
      const name = contactForm.querySelector('#name');
      const email = contactForm.querySelector('#email');
      const message = contactForm.querySelector('#message');

      if (name && !name.value.trim()) {
        name.closest('.form-group').classList.add('error');
        isValid = false;
      }

      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email.value.trim() || !emailRegex.test(email.value)) {
          email.closest('.form-group').classList.add('error');
          isValid = false;
        }
      }

      if (message && !message.value.trim()) {
        message.closest('.form-group').classList.add('error');
        isValid = false;
      }

      if (isValid) {
        const submitBtn = contactForm.querySelector('button[type="submit"]');
        const originalHtml = submitBtn.innerHTML;
        submitBtn.innerHTML = 'Saving...';
        submitBtn.disabled = true;

        const nameVal = name.value.trim();
        const emailVal = email.value.trim();
        const phone = contactForm.querySelector('#phone');
        const phoneVal = phone ? phone.value.trim() : '';
        const service = contactForm.querySelector('#service');
        const serviceVal = service ? service.value : '';
        const messageVal = message.value.trim();

        const lead = {
          name: nameVal,
          email: emailVal,
          phone: phoneVal,
          service: serviceVal,
          message: messageVal,
          source: window.location.pathname || 'contact.html',
          page_url: window.location.href,
          created_at: new Date().toISOString()
        };

        const routes = buildLeadRoutes(lead);
        const savedResult = await saveLeadRecord(lead);
        const isBusiness = serviceVal === 'business';

        showContactConfirmation(lead, savedResult, routes);
        showToast(isBusiness ? 'Business inquiry saved. Opening WhatsApp and email...' : 'Message saved. Opening your email client...');

        if (isBusiness) {
          window.open(routes.whatsapp, '_blank', 'noopener');
        }

        window.location.href = routes.mailto;
        contactForm.reset();
        submitBtn.innerHTML = originalHtml;
        submitBtn.disabled = false;
      }
    });

    // Real-time validation removal
    contactForm.querySelectorAll('.form-input, .form-textarea').forEach((input) => {
      input.addEventListener('input', () => {
        input.closest('.form-group').classList.remove('error');
      });
    });
  }

  /* ---------- Toast ---------- */
  function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  /* ---------- Back to Top ---------- */
  const backToTop = document.getElementById('back-to-top');
  if (backToTop) {
    window.addEventListener('scroll', () => {
      backToTop.style.opacity = window.scrollY > 600 ? '1' : '0';
      backToTop.style.pointerEvents = window.scrollY > 600 ? 'auto' : 'none';
    }, { passive: true });

    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
});
