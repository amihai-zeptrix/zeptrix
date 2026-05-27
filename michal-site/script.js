/* מיכל בן חיון — interactions */
(function () {
  "use strict";

  /* ---- Sticky header ---- */
  const header = document.getElementById("header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 40);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---- Mobile nav ---- */
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("nav");
  const closeNav = () => { nav.classList.remove("open"); toggle.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); };
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
  });
  nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeNav));

  /* ---- Profile picture → center the About portrait frame in view ---- */
  const brandMarkLink = document.querySelector(".brand-mark-link");
  if (brandMarkLink) {
    brandMarkLink.addEventListener("click", (e) => {
      const frame = document.querySelector("#about .about-photo");
      if (frame) {
        e.preventDefault();
        frame.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  /* ---- Scroll reveal ---- */
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach((el, i) => { el.style.transitionDelay = (i % 4) * 80 + "ms"; io.observe(el); });
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }

  /* ---- Animated counters ---- */
  const counters = document.querySelectorAll(".stat-num");
  const runCount = (el) => {
    const target = +el.dataset.count;
    const dur = 1400, start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if ("IntersectionObserver" in window) {
    const co = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { runCount(e.target); co.unobserve(e.target); } });
    }, { threshold: 0.6 });
    counters.forEach((c) => co.observe(c));
  } else {
    counters.forEach((c) => (c.textContent = c.dataset.count));
  }

  /* ---- Project filtering ---- */
  const filters = document.querySelectorAll(".filter");
  const projects = document.querySelectorAll(".project");
  filters.forEach((btn) => {
    btn.addEventListener("click", () => {
      filters.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const f = btn.dataset.filter;
      projects.forEach((p) => {
        const show = f === "all" || p.dataset.city === f;
        p.classList.toggle("hide", !show);
      });
    });
  });

  /* ---- Contact form (front-end demo validation) ---- */
  const form = document.getElementById("contactForm");
  const status = document.getElementById("formStatus");
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    status.className = "form-status";
    const name = form.name, phone = form.phone, email = form.email;
    let ok = true;

    [name, phone].forEach((f) => {
      const bad = !f.value.trim();
      f.classList.toggle("invalid", bad);
      if (bad) ok = false;
    });
    const emailBad = email.value.trim() && !emailRe.test(email.value.trim());
    email.classList.toggle("invalid", emailBad);
    if (emailBad) ok = false;

    if (!ok) {
      status.textContent = "נא למלא שם וטלפון תקינים.";
      status.classList.add("err");
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "שולח…";
    setTimeout(() => {
      form.reset();
      btn.disabled = false; btn.textContent = "שליחת פנייה";
      status.textContent = "תודה! הפנייה התקבלה — אחזור אליכם בהקדם. 🌊";
      status.classList.add("ok");
    }, 900);
  });

  /* ---- Footer year ---- */
  const yr = document.getElementById("year");
  if (yr) yr.textContent = new Date().getFullYear();
})();
