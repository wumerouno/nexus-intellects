/* ============================================================
   NEXUS INTELLECTS — Animation Utilities
   Scroll reveals, parallax, counters, typing effects
   ============================================================ */

const NexusAnimations = (() => {
  'use strict';

  /* ---------- Scroll Reveal (Intersection Observer) ---------- */
  function initScrollReveal() {
    const revealElements = document.querySelectorAll(
      '.reveal, .reveal-left, .reveal-right, .reveal-scale'
    );

    if (!revealElements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    revealElements.forEach((el) => observer.observe(el));
  }

  /* ---------- Counter Animation ---------- */
  function animateCounters() {
    const counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const target = parseInt(el.getAttribute('data-count'), 10);
            const suffix = el.getAttribute('data-suffix') || '';
            const prefix = el.getAttribute('data-prefix') || '';
            const duration = 2000;
            const startTime = performance.now();

            function update(currentTime) {
              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);
              // Ease out cubic
              const eased = 1 - Math.pow(1 - progress, 3);
              const current = Math.floor(eased * target);
              el.textContent = prefix + current.toLocaleString() + suffix;

              if (progress < 1) {
                requestAnimationFrame(update);
              } else {
                el.textContent = prefix + target.toLocaleString() + suffix;
              }
            }

            requestAnimationFrame(update);
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.3 }
    );

    counters.forEach((el) => observer.observe(el));
  }

  /* ---------- Parallax on Mouse Move ---------- */
  function initParallaxMouse() {
    const hero = document.querySelector('.hero');
    if (!hero) return;

    const meshes = hero.querySelectorAll('.hero__mesh');
    if (!meshes.length) return;

    hero.addEventListener('mousemove', (e) => {
      const rect = hero.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;

      meshes.forEach((mesh, i) => {
        const speed = (i + 1) * 15;
        mesh.style.transform = `translate(${x * speed}px, ${y * speed}px)`;
      });
    });
  }

  /* ---------- Staggered Entrance ---------- */
  function initStaggeredEntrance() {
    const groups = document.querySelectorAll('[data-stagger]');
    if (!groups.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const children = entry.target.children;
            Array.from(children).forEach((child, i) => {
              child.style.transitionDelay = `${i * 100}ms`;
              child.classList.add('visible');
            });
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    groups.forEach((g) => observer.observe(g));
  }

  /* ---------- Typing Effect ---------- */
  function initTypingEffect() {
    const typingEls = document.querySelectorAll('[data-typing]');
    if (!typingEls.length) return;

    typingEls.forEach((el) => {
      const text = el.getAttribute('data-typing');
      const speed = parseInt(el.getAttribute('data-typing-speed') || '50', 10);
      el.textContent = '';
      el.style.borderRight = '2px solid var(--clr-primary-light)';

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              let i = 0;
              function type() {
                if (i < text.length) {
                  el.textContent += text.charAt(i);
                  i++;
                  setTimeout(type, speed);
                } else {
                  // Blink cursor then remove
                  setTimeout(() => {
                    el.style.borderRight = 'none';
                  }, 1500);
                }
              }
              type();
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.5 }
      );

      observer.observe(el);
    });
  }

  /* ---------- Smooth Gradient Mesh Background Animation ---------- */
  function initGradientMesh() {
    const meshContainer = document.querySelector('.hero__bg');
    if (!meshContainer) return;

    // Already handled by CSS animations, but we add random drift for extra life
    const meshes = meshContainer.querySelectorAll('.hero__mesh');
    meshes.forEach((mesh) => {
      const randomDuration = 15 + Math.random() * 10;
      mesh.style.animationDuration = `${randomDuration}s`;
    });
  }

  /* ---------- Card Glow Effect (Radial Mouse Tracker) ---------- */
  function initCardGlow() {
    document.addEventListener('mousemove', (e) => {
      const cards = document.querySelectorAll('.job-card, .freelancer-card, .glass-card, .proposal-card');
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
      });
    });
  }

  /* ---------- Dynamic Toast Notifications ---------- */
  function showToast(message, type = 'success', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;

    let icon = '🔔';
    if (type === 'success') icon = '⚡';
    else if (type === 'error') icon = '⚠️';
    else if (type === 'info') icon = '⚖️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-fade-out');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, duration);
  }

  // Export showToast globally
  window.showToast = showToast;

  /* ---------- Public Init ---------- */
  function init() {
    initScrollReveal();
    animateCounters();
    initParallaxMouse();
    initStaggeredEntrance();
    initTypingEffect();
    initGradientMesh();
    initCardGlow();
  }

  return { init };
})();

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', NexusAnimations.init);
