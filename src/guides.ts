// FixGuide AI — original repair-guide content, written for this app.
// Each guide: diagnosis checks first, then the repair procedure.
// Steps are kept short (glasses display: 576x288, glanceable lines).

export interface GuideStep {
  title: string;
  body: string;
  tool?: string;
  warn?: string;
}

export interface Guide {
  id: string;
  name: string;
  symptom: string;
  time: string;
  difficulty: "Easy" | "Medium" | "Advanced";
  tools: string[];
  steps: GuideStep[];
}

export const GUIDES: Guide[] = [
  {
    id: "not-charging",
    name: "Not Charging",
    symptom: "Plugged in, battery % does not rise",
    time: "20-40 min",
    difficulty: "Easy",
    tools: ["USB power meter", "Known-good cable + charger", "Wooden toothpick", "Multimeter"],
    steps: [
      { title: "Rule out the charger", body: "Try a known-good cable and brick. Watch the charge icon for 60 seconds.", tool: "Spare cable + brick" },
      { title: "Measure the draw", body: "USB meter between brick and phone. Healthy draw: 0.5A or more. 0.00A = no connection.", tool: "USB power meter" },
      { title: "Clean the port", body: "Power off. Pick lint from the port with a wooden toothpick. Never metal.", tool: "Wooden toothpick", warn: "Metal picks short the port" },
      { title: "Check the port tongue", body: "Light + magnification: bent pins or a broken center tongue means port replacement.", tool: "Magnifier + light" },
      { title: "Battery test", body: "Open the phone. Battery connector voltage should read 3.7-4.4V. Below 3.0V = dead cell.", tool: "Multimeter", warn: "Swollen battery? Stop. Replace, do not charge." },
      { title: "Board-level check", body: "Still 0A with a good port and battery? Suspect charging IC or a short on VBUS. Diode-mode the port pins.", tool: "Multimeter (diode mode)" },
      { title: "Verify the fix", body: "Charge to 100%, then drain to 80% and charge again. Confirm stable current both times." },
    ],
  },
  {
    id: "wont-turn-on",
    name: "Won't Turn On",
    symptom: "Black screen, no response to power button",
    time: "30-60 min",
    difficulty: "Medium",
    tools: ["USB power meter", "Multimeter", "DC power supply (optional)", "Opening tools"],
    steps: [
      { title: "Force restart", body: "Hold Power + Volume Down for 15 seconds. Many 'dead' phones are just hung." },
      { title: "Charge 30 minutes", body: "Plug in and wait. A fully flat battery can take 10-20 min before showing any sign of life." },
      { title: "Read the current draw", body: "USB meter: 0A = port/battery path. Low 0.05-0.2A stuck = board fault. Normal pulsing = charging.", tool: "USB power meter" },
      { title: "Check for signs of life", body: "Feel for vibration, listen for sounds, connect to a PC and watch for USB detection." },
      { title: "Battery voltage", body: "Open the phone, measure the battery. Under 3.0V: pre-charge or replace the battery.", tool: "Multimeter" },
      { title: "Boot current test", body: "On a DC supply at 4.0V, press power. A healthy boot pulses 0.2-1.5A. Instant 2A+ = short circuit.", tool: "DC power supply", warn: "Do not exceed 4.2V" },
      { title: "Verify the fix", body: "Boot fully, check charging, run a 10-minute stress test (video + brightness max)." },
    ],
  },
  {
    id: "black-screen",
    name: "Black Screen",
    symptom: "Phone vibrates/rings but display stays dark",
    time: "20-45 min",
    difficulty: "Medium",
    tools: ["Flashlight", "Multimeter", "Opening tools", "Spare display (test)"],
    steps: [
      { title: "Flashlight test", body: "Shine a bright light at an angle. Faint image visible = backlight fault, not a dead panel.", tool: "Flashlight" },
      { title: "Force restart", body: "Power + Volume Down, 15 seconds. Rule out a frozen display driver." },
      { title: "Check touch + sounds", body: "Call the phone. If it rings and touch works, the board is alive — focus on the display path." },
      { title: "Reseat the display flex", body: "Open, disconnect the battery first, then reseat the display connector. Check for torn flex or corrosion.", warn: "Battery first, always" },
      { title: "Test with a spare screen", body: "Connect a known-good display without fully assembling. Image = replace screen. Still black = board.", tool: "Spare display" },
      { title: "Backlight circuit", body: "No image on spare + flashlight shows faint picture: check backlight diode/coil near the display connector.", tool: "Multimeter (diode mode)" },
      { title: "Verify the fix", body: "Full brightness sweep, touch test on all corners, 5-minute video playback." },
    ],
  },
  {
    id: "water-damage",
    name: "Water Damage",
    symptom: "Dropped in water / liquid spill",
    time: "45-90 min",
    difficulty: "Advanced",
    tools: ["Isopropyl alcohol 99%", "Soft brush", "Ultrasonic cleaner (optional)", "Multimeter"],
    steps: [
      { title: "Power OFF now", body: "Do not charge, do not press buttons. Electricity + water = corrosion and shorts.", warn: "Charging a wet phone kills it" },
      { title: "Remove battery + SIM", body: "Open the phone, disconnect the battery first. Remove SIM/SD tray." },
      { title: "Dry, don't cook", body: "Shake out water, blot dry. No hair dryer heat, no rice myth — rice does not dry internals." },
      { title: "Alcohol bath", body: "Scrub the board with 99% isopropyl alcohol and a soft brush. Focus on connectors and shields.", tool: "IPA 99% + brush" },
      { title: "Inspect for corrosion", body: "Under magnification: white/green deposits, darkened pads, eaten traces. Clean or repair as found.", tool: "Magnifier" },
      { title: "Check shorts", body: "Diode-mode the battery connector and main rails. Near-zero reading = short to find before powering.", tool: "Multimeter" },
      { title: "First power-on", body: "Use a DC supply with current limit. Watch draw; stop instantly on abnormal current.", tool: "DC power supply" },
      { title: "Verify everything", body: "Test: charge, touch, cameras, speaker, mic, Wi-Fi, sensors. Water damage hides late failures." },
    ],
  },
  {
    id: "battery-drain",
    name: "Battery Drain",
    symptom: "Battery dies in a few hours",
    time: "15-30 min",
    difficulty: "Easy",
    tools: ["USB power meter", "Battery health app", "Multimeter (optional)"],
    steps: [
      { title: "Check battery health", body: "Settings > Battery health. Under 80% capacity = replace the battery, stop diagnosing." },
      { title: "Find the hungry app", body: "Battery usage list: one app over 30% in background = the culprit. Update or restrict it." },
      { title: "Standby drain test", body: "Charge to 100%, airplane mode, leave 1 hour. More than 2-3% loss = hardware or rogue process." },
      { title: "Heat check", body: "A warm phone at idle means something is working hard — or a partial short. Note where it heats." },
      { title: "Charging behavior", body: "USB meter: erratic current or stopping early points to a worn cell or charge-path fault.", tool: "USB power meter" },
      { title: "Replace or repair", body: "Old battery: replace. New battery still draining: board-level leakage test with DC supply.", tool: "DC power supply" },
      { title: "Verify the fix", body: "Full day of normal use. Target: under 1% per hour standby, 6+ hours screen-on." },
    ],
  },
  {
    id: "touch-not-working",
    name: "Touch Not Working",
    symptom: "Display shows image, touch dead or erratic",
    time: "20-40 min",
    difficulty: "Medium",
    tools: ["Opening tools", "Spare display (test)", "Multimeter"],
    steps: [
      { title: "Restart + clean", body: "Force restart. Clean the screen, remove the case and screen protector — cheap protectors cause ghost touch." },
      { title: "Map the dead zone", body: "Draw lines across the whole screen in a notes app. A straight dead band = digitizer damage." },
      { title: "Check for damage", body: "Hairline cracks, lifted corners, or liquid under the glass all kill touch in that area." },
      { title: "Reseat the flex", body: "Open, battery first, reseat the display/touch connector. Inspect the flex for tears.", warn: "Battery first, always" },
      { title: "Test a spare screen", body: "Known-good display: touch back = replace screen. Still dead = touch IC or board path.", tool: "Spare display" },
      { title: "Verify the fix", body: "Full-screen drawing test, multi-touch (pinch) test, typing test on all keyboard rows." },
    ],
  },
  {
    id: "boot-loop",
    name: "Boot Loop",
    symptom: "Stuck on logo, restarts forever",
    time: "30-60 min",
    difficulty: "Medium",
    tools: ["PC + cable", "Multimeter", "DC power supply (optional)"],
    steps: [
      { title: "Charge first", body: "A weak battery loops at the logo. Charge 30 min, then try booting while plugged in." },
      { title: "Safe mode / recovery", body: "Boot to recovery. Wipe cache partition if offered — no data loss, often fixes update loops." },
      { title: "Recent changes?", body: "New app, update, or drop right before the loop? Uninstall via safe mode, or suspect hardware after a drop." },
      { title: "Battery swap test", body: "Boot with a known-good battery. Loops gone = battery. Same loop = software or board." },
      { title: "Flash stock firmware", body: "Last software resort: reflash official firmware. Warn the customer: data may be lost.", warn: "Get customer OK before flashing" },
      { title: "Board-level check", body: "Still looping on stock firmware: check boot current pattern and storage (UFS/eMMC) health.", tool: "DC power supply" },
      { title: "Verify the fix", body: "Three clean cold boots, then 15 minutes of mixed use with no restart." },
    ],
  },
  {
    id: "overheating",
    name: "Overheating",
    symptom: "Phone gets hot, throttles or shuts down",
    time: "20-40 min",
    difficulty: "Easy",
    tools: ["Battery health app", "USB power meter", "Thermal check (hand/IR)"],
    steps: [
      { title: "When does it heat?", body: "Only charging? Only gaming? At idle? The pattern points to the cause. Note it before opening anything." },
      { title: "Battery health", body: "Under 80% or swollen = replace. A dying battery heats under any load.", warn: "Swollen battery = replace now" },
      { title: "Background load", body: "Battery usage: a stuck app or sync loop cooks the CPU. Restrict, update, or remove it." },
      { title: "Charging heat", body: "Hot while charging with a third-party brick: test with the original charger and a USB meter.", tool: "USB power meter" },
      { title: "Locate the hot spot", body: "Top = CPU/board. Center = battery. Bottom = charge port/IC. The location is the diagnosis." },
      { title: "Thermal paste / shields", body: "After any board work, confirm shields and thermal pads are back in place — missing pads = hot spots." },
      { title: "Verify the fix", body: "20-minute video + charge test. Warm is fine; too hot to hold is not." },
    ],
  },
];

export function getGuide(id: string): Guide | undefined {
  return GUIDES.find((g) => g.id === id);
}
