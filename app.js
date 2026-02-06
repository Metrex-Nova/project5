// State and config
const rosterUrl = "https://jsonplaceholder.typicode.com/users?_limit=10";
const clockUrl = "https://worldtimeapi.org/api/timezone/Asia/Kolkata";

// DOM elements
const providerSelect = document.getElementById("providerSelect");
const dateInput = document.getElementById("dateInput");
const loadSlotsBtn = document.getElementById("loadSlotsBtn");
const refreshBtn = document.getElementById("refreshBtn");
const slotsGrid = document.getElementById("slotsGrid");
const slotsHeadline = document.getElementById("slotsHeadline");
const slotMeta = document.getElementById("slotMeta");
const bookingsList = document.getElementById("bookingsList");
const clearBookingsBtn = document.getElementById("clearBookingsBtn");
const statProviders = document.getElementById("statProviders");
const statBookings = document.getElementById("statBookings");
const statClock = document.getElementById("statClock");
const lastSync = document.getElementById("lastSync");

// Modal elements
const confirmModal = new bootstrap.Modal(document.getElementById("confirmModal"));
const confirmTitle = document.getElementById("confirmTitle");
const confirmMeta = document.getElementById("confirmMeta");
const confirmBtn = document.getElementById("confirmBtn");
const notesInput = document.getElementById("notesInput");

// App state
const state = {
  providers: [],
  nowUtc: null,
  target: null,
  bookings: [],
  pendingSlot: null,
  theme: localStorage.getItem('theme') || 'light'
};

// Initialize theme
function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeIcon();
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('theme', state.theme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const icon = document.querySelector('.theme-toggle-btn i');
  if (icon) {
    icon.className = state.theme === 'light' ? 'bi bi-moon' : 'bi bi-sun';
  }
}

// Create theme toggle button
function createThemeToggle() {
  const toggleDiv = document.createElement('div');
  toggleDiv.className = 'theme-toggle';
  toggleDiv.innerHTML = `
    <button class="theme-toggle-btn btn btn-sm">
      <i class="bi ${state.theme === 'light' ? 'bi-moon' : 'bi-sun'}"></i>
    </button>
  `;
  document.body.appendChild(toggleDiv);
  
  toggleDiv.querySelector('button').addEventListener('click', toggleTheme);
}

// Initialize
function initApp() {
  initTheme();
  createThemeToggle();
  readBookings();
  setMinDate();
  fetchProviders();
  syncClock();
  renderBookings();
  
  // Auto-sync clock every 30 seconds
  setInterval(syncClock, 30000);
  
  // Auto-sync slots when tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.target) {
      syncClock().then(() => {
        renderSlots(state.target.providerId, state.target.date);
      });
    }
  });
}

// Bookings management
function readBookings() {
  const saved = localStorage.getItem("quickslot-bookings");
  state.bookings = saved ? JSON.parse(saved) : [];
  statBookings.textContent = state.bookings.length;
}

function saveBookings() {
  localStorage.setItem("quickslot-bookings", JSON.stringify(state.bookings));
  statBookings.textContent = state.bookings.length;
}

// Provider fetching
async function fetchProviders() {
  providerSelect.disabled = true;
  providerSelect.innerHTML = `<option>Loading roster…</option>`;

  try {
    const res = await fetch(rosterUrl);
    const data = await res.json();

    state.providers = data.map((person) => ({
      id: person.id,
      name: person.name,
      specialty: person.company?.bs || "Generalist",
      city: person.address?.city || "Remote",
    }));

    statProviders.textContent = state.providers.length;
    renderProviderSelect();
  } catch (err) {
    providerSelect.innerHTML = `<option>Error loading providers</option>`;
    console.error("Failed to fetch providers:", err);
  }
}

function renderProviderSelect() {
  providerSelect.disabled = false;
  providerSelect.innerHTML = `<option value="">Select provider</option>`;

  state.providers.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} — ${p.specialty}`;
    providerSelect.appendChild(opt);
  });
}

// Time synchronization
async function syncClock() {
  try {
    const res = await fetch(clockUrl);
    const data = await res.json();
    state.nowUtc = new Date(data.datetime);

    const timeStr = state.nowUtc.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });

    statClock.textContent = timeStr;
    lastSync.textContent = `Synced ${new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit"
    })}`;
    
    // Add animation feedback
    statClock.classList.add('fade-in');
    setTimeout(() => statClock.classList.remove('fade-in'), 500);
    
  } catch (err) {
    console.warn("Clock sync failed, using fallback", err);
    state.nowUtc = new Date();
    statClock.textContent = state.nowUtc.toLocaleTimeString("en-IN");
    lastSync.textContent = `Fallback ${new Date().toLocaleTimeString("en-IN")}`;
  }
}

// Date handling
function setMinDate() {
  const today = new Date().toISOString().split("T")[0];
  dateInput.min = today;
  if (!dateInput.value) {
    dateInput.value = today;
  }
}

// Slot generation
function buildSlots(date) {
  const slots = [];
  for (let hour = 9; hour <= 17; hour++) {
    ["00", "30"].forEach((minute) => {
      slots.push({
        label: `${String(hour).padStart(2, "0")}:${minute}`,
        disabled: isSlotDisabled(date, `${String(hour).padStart(2, "0")}:${minute}`)
      });
    });
  }
  return slots;
}

function isSlotDisabled(date, slotLabel) {
  const targetDate = new Date(`${date}T${slotLabel}:00+05:30`);
  const now = state.nowUtc || new Date();

  if (targetDate < now) return true;

  return state.bookings.some(
    (item) =>
      item.date === date &&
      item.slot === slotLabel &&
      item.providerId === state.target?.providerId
  );
}

// Slot rendering
function renderSlots(providerId, date) {
  const provider = state.providers.find((p) => p.id === Number(providerId));

  if (!provider || !date) {
    slotsGrid.innerHTML = `
      <div class="col-12 text-center text-secondary py-5">
        <i class="bi bi-calendar3 fs-1 mb-3 d-block"></i>
        <p>Select a provider and date to view availability</p>
      </div>
    `;
    slotsHeadline.textContent = "Select provider + date";
    slotMeta.textContent = "";
    return;
  }

  state.target = { providerId: provider.id, providerName: provider.name, date };

  slotsHeadline.textContent = `Available slots for ${provider.name}`;
  slotMeta.textContent = `${new Date(date).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })} • Last updated ${new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  })}`;

  const slots = buildSlots(date);
  slotsGrid.innerHTML = "";

  slots.forEach((slot) => {
    const col = document.createElement("div");
    col.className = "col-6 col-xl-4 fade-in";

    const card = document.createElement("div");
    card.className = `slot-card h-100 ${slot.disabled ? "disabled" : "available"}`;
    card.innerHTML = `
      <div class="fw-semibold fs-5 mb-1">${slot.label}</div>
      <div class="small ${slot.disabled ? 'text-secondary' : 'text-primary'}">
        ${slot.disabled ? '<i class="bi bi-x-circle me-1"></i>Unavailable' : '<i class="bi bi-check-circle me-1"></i>Available'}
      </div>
    `;

    if (!slot.disabled) {
      card.onclick = () => openModal(provider, date, slot.label);
      card.style.cursor = "pointer";
    }

    col.appendChild(card);
    slotsGrid.appendChild(col);
  });
}

// Modal handling
function openModal(provider, date, slotLabel) {
  state.pendingSlot = { provider, date, slotLabel };
  
  confirmTitle.textContent = provider.name;
  confirmMeta.innerHTML = `
    <i class="bi bi-calendar me-1"></i>${date}<br>
    <i class="bi bi-clock me-1"></i>${slotLabel} IST<br>
    <i class="bi bi-person me-1"></i>${provider.specialty}
  `;
  notesInput.value = "";
  
  confirmModal.show();
}

confirmBtn.addEventListener("click", () => {
  if (!state.pendingSlot) return;

  const payload = {
    id: crypto.randomUUID(),
    providerId: state.pendingSlot.provider.id,
    provider: state.pendingSlot.provider.name,
    specialty: state.pendingSlot.provider.specialty,
    date: state.pendingSlot.date,
    slot: state.pendingSlot.slotLabel,
    notes: notesInput.value.trim(),
    createdAt: new Date().toISOString()
  };

  state.bookings.push(payload);
  saveBookings();
  
  // Show success feedback
  const originalText = confirmBtn.innerHTML;
  confirmBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Booked!';
  confirmBtn.classList.add('btn-success');
  
  setTimeout(() => {
    confirmModal.hide();
    setTimeout(() => {
      confirmBtn.innerHTML = originalText;
      confirmBtn.classList.remove('btn-success');
      renderSlots(state.pendingSlot.provider.id, state.pendingSlot.date);
      renderBookings();
    }, 300);
  }, 1000);
  
  // Optional: Send confirmation (simulated)
  sendConfirmationEmail(payload);
});

// Booking management
function renderBookings() {
  bookingsList.innerHTML = "";

  if (!state.bookings.length) {
    bookingsList.innerHTML = `
      <div class="text-center text-secondary py-4">
        <i class="bi bi-calendar-x fs-1 mb-3 d-block"></i>
        <p>No upcoming bookings</p>
        <small class="text-muted">Book a slot to see it here</small>
      </div>
    `;
    return;
  }

  state.bookings
    .slice()
    .sort((a, b) => `${a.date}${a.slot}`.localeCompare(`${b.date}${b.slot}`))
    .forEach((booking) => {
      const card = document.createElement("div");
      card.className = "booking-card fade-in";
      
      const bookingDate = new Date(`${booking.date}T${booking.slot}:00`);
      const isToday = bookingDate.toDateString() === new Date().toDateString();
      
      card.innerHTML = `
        <div class="d-flex justify-content-between align-items-start gap-3">
          <div class="flex-grow-1">
            <div class="d-flex align-items-center gap-2 mb-1">
              <span class="fw-semibold">${booking.provider}</span>
              ${isToday ? '<span class="badge bg-primary">Today</span>' : ''}
            </div>
            <div class="small text-secondary mb-2">
              <i class="bi bi-calendar me-1"></i>${booking.date}
              <i class="bi bi-clock ms-3 me-1"></i>${booking.slot}
            </div>
            ${booking.notes ? `
              <div class="small text-muted">
                <i class="bi bi-chat-left-text me-1"></i>${booking.notes}
              </div>
            ` : ''}
          </div>
          <button class="btn btn-sm btn-outline-danger" data-id="${booking.id}">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      `;

      card.querySelector("button").onclick = () => cancelBooking(booking.id);
      bookingsList.appendChild(card);
    });
}

function cancelBooking(id) {
  const booking = state.bookings.find(b => b.id === id);
  if (booking && confirm(`Cancel booking with ${booking.provider} on ${booking.date} at ${booking.slot}?`)) {
    state.bookings = state.bookings.filter((b) => b.id !== id);
    saveBookings();
    renderBookings();
    if (state.target) {
      renderSlots(state.target.providerId, state.target.date);
    }
  }
}

// Clear all bookings
clearBookingsBtn.addEventListener("click", () => {
  if (!state.bookings.length) return;

  if (confirm("Are you sure you want to clear ALL bookings?")) {
    state.bookings = [];
    saveBookings();
    renderBookings();
    if (state.target) {
      renderSlots(state.target.providerId, state.target.date);
    }
  }
});

// Event listeners
loadSlotsBtn.addEventListener("click", async () => {
  const providerId = providerSelect.value;
  const date = dateInput.value;

  if (!providerId) {
    alert("Please select a provider");
    providerSelect.focus();
    return;
  }
  if (!date) {
    alert("Please select a date");
    dateInput.focus();
    return;
  }

  loadSlotsBtn.disabled = true;
  loadSlotsBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
  
  await syncClock();
  renderSlots(providerId, date);
  
  setTimeout(() => {
    loadSlotsBtn.disabled = false;
    loadSlotsBtn.innerHTML = '<i class="bi bi-search"></i> Fetch Slots';
  }, 300);
});

refreshBtn.addEventListener("click", async () => {
  refreshBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
  await syncClock();
  if (state.target) {
    renderSlots(state.target.providerId, state.target.date);
  }
  setTimeout(() => {
    refreshBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i>';
  }, 500);
});

// Optional: Simulated email confirmation
function sendConfirmationEmail(booking) {
  console.log("Booking confirmed:", booking);
  // In a real app, this would call your backend API
}

// Initialize the app
document.addEventListener('DOMContentLoaded', initApp);
