const header = document.querySelector("[data-elevate]");
const canvas = document.querySelector("#signalCanvas");
const context = canvas.getContext("2d");
const leadForm = document.querySelector("#leadForm");
const formStatus = document.querySelector("#formStatus");
const multiSelect = document.querySelector("[data-multi-select]");
const multiSelectLabel = multiSelect?.querySelector("[data-multi-select-label]");
const multiSelectInputs = multiSelect ? Array.from(multiSelect.querySelectorAll("input[type='checkbox']")) : [];

function setHeaderState() {
  header.classList.toggle("is-elevated", window.scrollY > 24);
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(canvas.offsetWidth * ratio);
  canvas.height = Math.floor(canvas.offsetHeight * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawSignal(time) {
  const width = canvas.offsetWidth;
  const height = canvas.offsetHeight;

  context.clearRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07110e");
  gradient.addColorStop(0.46, "#153d34");
  gradient.addColorStop(1, "#8d5732");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const cols = Math.ceil(width / 86);
  const rows = Math.ceil(height / 70);
  context.lineWidth = 1;

  for (let x = 0; x <= cols; x += 1) {
    const px = x * 86;
    context.strokeStyle = "rgba(255,255,255,0.055)";
    context.beginPath();
    context.moveTo(px, 0);
    context.lineTo(px, height);
    context.stroke();
  }

  for (let y = 0; y <= rows; y += 1) {
    const py = y * 70;
    context.strokeStyle = "rgba(255,255,255,0.05)";
    context.beginPath();
    context.moveTo(0, py);
    context.lineTo(width, py);
    context.stroke();
  }

  const lanes = [
    { color: "25,199,162", offset: 0, amp: 36 },
    { color: "240,185,77", offset: 1.4, amp: 52 },
    { color: "238,116,95", offset: 2.7, amp: 29 },
  ];

  lanes.forEach((lane, index) => {
    const base = height * (0.28 + index * 0.2);
    context.strokeStyle = `rgba(${lane.color},0.5)`;
    context.lineWidth = 2;
    context.beginPath();

    for (let x = 0; x <= width; x += 10) {
      const wave = Math.sin(x * 0.012 + time * 0.0012 + lane.offset);
      const pulse = Math.cos(x * 0.026 - time * 0.001 + lane.offset);
      const y = base + wave * lane.amp + pulse * 14;
      if (x === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }

    context.stroke();
  });

  const blocks = [
    [0.64, 0.2, 170, 76, "#19c7a2", "Rightsize"],
    [0.76, 0.39, 210, 82, "#f0b94d", "Commitment gap"],
    [0.58, 0.58, 190, 76, "#ee745f", "Network spike"],
  ];

  blocks.forEach(([xRatio, yRatio, blockWidth, blockHeight, color, label]) => {
    const x = Math.min(width - blockWidth - 24, width * xRatio);
    const y = height * yRatio;
    context.fillStyle = "rgba(7,17,14,0.58)";
    context.strokeStyle = "rgba(255,255,255,0.16)";
    context.lineWidth = 1;
    context.beginPath();
    context.roundRect(x, y, blockWidth, blockHeight, 8);
    context.fill();
    context.stroke();

    context.fillStyle = color;
    context.beginPath();
    context.arc(x + 22, y + 24, 6, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "rgba(255,255,255,0.9)";
    context.font = "700 14px Inter, sans-serif";
    context.fillText(label, x + 40, y + 29);

    context.fillStyle = "rgba(255,255,255,0.48)";
    context.font = "600 12px Inter, sans-serif";
    context.fillText("AI-ranked AWS action", x + 22, y + 55);
  });

  requestAnimationFrame(drawSignal);
}

function updateMultiSelectLabel() {
  if (!multiSelectLabel) return;

  const selected = multiSelectInputs.filter((input) => input.checked);
  if (selected.length === 0) {
    multiSelectLabel.textContent = "Select AWS components";
    return;
  }

  if (selected.length === 1) {
    const optionText = selected[0].closest("label")?.querySelector("span")?.textContent?.trim();
    multiSelectLabel.textContent = optionText || "1 component selected";
    return;
  }

  multiSelectLabel.innerHTML = `<span class="multi-select-summary">${selected.length} components selected</span> <span class="multi-select-count">Review list</span>`;
}

if ("roundRect" in context) {
  resizeCanvas();
  requestAnimationFrame(drawSignal);
} else {
  canvas.style.display = "none";
}

setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });
window.addEventListener("resize", resizeCanvas);

multiSelectInputs.forEach((input) => {
  input.addEventListener("change", updateMultiSelectLabel);
});

leadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = leadForm.querySelector("button[type='submit']");
  const formData = new FormData(leadForm);
  const components = formData.getAll("components");
  const payload = {
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    company: String(formData.get("company") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    awsAccounts: formData.get("awsAccounts") ? Number(formData.get("awsAccounts")) : null,
    components,
  };

  formStatus.className = "form-status";
  formStatus.textContent = "Submitting your free analysis request...";
  submitButton.disabled = true;

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok || result.status !== "ok") {
      throw new Error(result.message || "Registration failed.");
    }

    leadForm.reset();
    updateMultiSelectLabel();
    formStatus.classList.add("success");
    formStatus.textContent = "Registered. We received your details and will start the free analysis conversation shortly.";
  } catch (error) {
    formStatus.classList.add("error");
    formStatus.textContent = "Could not submit right now. Email hello@zeptrix.io and we will handle it manually.";
  } finally {
    submitButton.disabled = false;
  }
});

updateMultiSelectLabel();
