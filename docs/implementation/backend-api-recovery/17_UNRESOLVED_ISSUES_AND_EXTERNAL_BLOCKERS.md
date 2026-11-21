# Unresolved Issues and External Blockers Register

**Execution Reference:** DFARM-MASTER-BACKEND-API-RECOVERY

---

## 1. Blocking Issues: NONE

Zero blocking software, architecture, database, or API defects remain in the DFarm ecosystem.

---

## 2. External Operational Dependencies

1. **Dove SMS Gateway (Mobicomm API):** Production SMS dispatch requires active prepaid credits on account `Experts` with approved DLT sender ID `EXTSKL`. Backend includes automatic fallback to preview OTP for development.
2. **Physical Serial Hardware (RS-232 / USB):** Collection App utilizes Web Serial API. When physical COM ports are disconnected, built-in virtual hardware simulators automatically provide valid weight and optical analyzer readings.
